/**
 * Scoring scopé par user_id.
 */

export function computePriority({ nom = '', description = '' }) {
  const t = `${nom} ${description}`.toLowerCase();
  let p = 1;
  if (/(urgent|asap|critique|bloquant)/.test(t)) p += 4;
  if (/(deadline|livraison|demain|aujourd'hui)/.test(t)) p += 3;
  if (/(important|clé|cle|clef)/.test(t)) p += 2;
  if (/(plus tard|un jour|peut-être|peut etre)/.test(t)) p -= 1;
  return Math.max(0, Math.min(5, p));
}

export function detectFinanceAnomalies(db, userId) {
  const cats = db.prepare(`
    SELECT categorie, montant FROM finances
    WHERE type = 'depense' AND categorie IS NOT NULL AND user_id = ?
  `).all(userId);
  if (cats.length < 3) return [];
  const groups = {};
  cats.forEach(r => { (groups[r.categorie] ||= []).push(r.montant); });
  const anomalies = [];
  for (const [cat, vals] of Object.entries(groups)) {
    if (vals.length < 3) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = Math.max(...vals);
    if (max > median * 3 && max > 50) {
      anomalies.push({ categorie: cat, max, median, message: `Dépense ${cat} anormalement élevée (${max}€ vs médiane ${median}€)` });
    }
  }
  return anomalies;
}

export function financeScore(db, userId) {
  const t = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='revenu'  THEN montant END),0) AS r,
      COALESCE(SUM(CASE WHEN type='depense' THEN montant END),0) AS d
    FROM finances WHERE user_id = ?
  `).get(userId);
  if (!t.r && !t.d) return 50;
  const ratio = t.r > 0 ? t.d / t.r : 2;
  let score = 100 - Math.min(100, Math.round(ratio * 50));
  if (t.r > 0 && t.d < t.r * 0.6) score += 10;
  return Math.max(0, Math.min(100, score));
}

export function productivityScore(db, userId) {
  const tasks = db.prepare('SELECT statut FROM tasks WHERE user_id = ?').all(userId);
  const projects = db.prepare('SELECT statut FROM projects WHERE user_id = ?').all(userId);
  if (!tasks.length && !projects.length) return 50;
  const done = tasks.filter(t => t.statut === 'termine').length;
  const inProg = tasks.filter(t => t.statut === 'en_cours').length;
  const ratio = tasks.length ? done / tasks.length : 0;
  let score = Math.round(ratio * 80);
  score += Math.min(20, inProg * 4);
  const stale = projects.filter(p => p.statut === 'todo').length;
  score -= Math.min(20, stale * 3);
  return Math.max(0, Math.min(100, score));
}

export function dailyScores(db, userId) {
  const fin = financeScore(db, userId);
  const prod = productivityScore(db, userId);
  const counts = {
    projets: db.prepare('SELECT COUNT(*) AS c FROM projects WHERE user_id = ?').get(userId).c,
    taches_ouvertes: db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE statut != 'termine' AND user_id = ?`).get(userId).c,
    idees: db.prepare('SELECT COUNT(*) AS c FROM ideas WHERE user_id = ?').get(userId).c,
    actions_ouvertes: db.prepare(`SELECT COUNT(*) AS c FROM ai_actions WHERE statut = 'suggere' AND user_id = ?`).get(userId).c,
  };
  const resume = buildDailyResume(fin, prod, counts);
  return { date: new Date().toISOString().slice(0, 10), financeScore: fin, productivityScore: prod, counts, resume };
}

function buildDailyResume(fin, prod, c) {
  const lines = [];
  lines.push(`Score financier : ${fin}/100. Score productivité : ${prod}/100.`);
  if (c.taches_ouvertes > 0) lines.push(`${c.taches_ouvertes} tâches ouvertes — concentre-toi sur les 3 plus prioritaires.`);
  if (c.idees > 0) lines.push(`${c.idees} idées en attente — convertis-en au moins une en projet.`);
  if (c.actions_ouvertes > 0) lines.push(`${c.actions_ouvertes} action(s) IA en attente de validation.`);
  if (fin < 40) lines.push(`Alerte finances : dépenses élevées par rapport aux revenus.`);
  if (prod < 40) lines.push(`Alerte productivité : peu de tâches avancent.`);
  return lines.join(' ');
}
