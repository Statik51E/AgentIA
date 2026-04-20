/**
 * Moteur de suggestions semi-autonome, scopé par user_id.
 */

import { detectFinanceAnomalies, dailyScores } from './scoring.js';
import { planSuggestions } from './aiProvider.js';

const INTERVAL_MS = 10 * 60 * 1000;

export function startSuggestionsLoop() {
  setTimeout(() => runCycle().catch(e => console.warn('[SUG]', e.message)), 30_000);
  setInterval(() => runCycle().catch(e => console.warn('[SUG]', e.message)), INTERVAL_MS);
}

async function runCycle() {
  const db = (await import('../db.js')).default;
  // Pour chaque utilisateur ayant de la donnée, on lance un cycle
  const users = db.prepare(`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM finances UNION
      SELECT user_id FROM projects UNION
      SELECT user_id FROM ideas UNION
      SELECT user_id FROM ai_actions
    ) WHERE user_id != ''
  `).all();
  for (const { user_id } of users) {
    try {
      const created = await generateSuggestions(db, user_id);
      if (created.length) console.log(`[SUG] ${created.length} pour ${user_id.slice(0, 6)}…`);
    } catch (e) { console.warn('[SUG] user', user_id.slice(0, 6), e.message); }
  }
}

export async function generateSuggestions(db, userId) {
  const context = buildContext(db, userId);
  const aiPlan = await planSuggestions(context);
  const suggestions = aiPlan !== null ? aiPlan : fallbackRules(db, context, userId);
  return persistFresh(db, suggestions, userId);
}

function buildContext(db, userId) {
  return {
    date: new Date().toISOString(),
    scores: dailyScores(db, userId),
    anomalies: detectFinanceAnomalies(db, userId),
    projets: db.prepare('SELECT id, nom, description, statut, priorite, date FROM projects WHERE user_id = ?').all(userId),
    taches_ouvertes: db.prepare(`
      SELECT id, project_id, titre, statut, priorite
      FROM tasks WHERE statut != 'termine' AND user_id = ? LIMIT 40
    `).all(userId),
    idees: db.prepare('SELECT id, contenu, date FROM ideas WHERE user_id = ? LIMIT 20').all(userId)
      .map(i => ({ ...i, contenu: (i.contenu || '').slice(0, 200) })),
    finances_recentes: db.prepare(`
      SELECT id, type, montant, categorie, date, note
      FROM finances WHERE user_id = ? ORDER BY date DESC LIMIT 60
    `).all(userId),
    charges_fixes: db.prepare(`SELECT id, libelle, montant, categorie, jour_mois, actif FROM fixed_expenses WHERE user_id = ?`).all(userId),
    suggestions_ouvertes: db.prepare(`SELECT type, description FROM ai_actions WHERE statut='suggere' AND user_id = ?`).all(userId),
  };
}

function fallbackRules(db, context, userId) {
  const out = [];
  for (const a of context.anomalies) {
    out.push({ type: 'finance_anomalie', description: a.message, payload: { categorie: a.categorie, max: a.max, median: a.median } });
  }
  const stale = db.prepare(`
    SELECT id, nom FROM projects
    WHERE statut = 'todo' AND julianday('now') - julianday(date) > 7 AND user_id = ? LIMIT 5
  `).all(userId);
  for (const p of stale) {
    out.push({ type: 'projet_stagnant', description: `Projet "${p.nom}" en attente depuis +7j. Le relancer ou l'archiver ?`, payload: { projectId: p.id } });
  }
  const oldIdeas = db.prepare(`
    SELECT id, contenu FROM ideas
    WHERE julianday('now') - julianday(date) > 3 AND user_id = ? LIMIT 5
  `).all(userId);
  for (const i of oldIdeas) {
    out.push({ type: 'idee_a_convertir', description: `Idée "${(i.contenu || '').slice(0, 60)}…" dort depuis +3j. La convertir en projet ?`, payload: { ideaId: i.id } });
  }
  const s = context.scores;
  if (s.productivityScore < 40 && s.counts.taches_ouvertes > 3) {
    out.push({ type: 'optim_productivite', description: `Productivité à ${s.productivityScore}/100. Réduire les tâches ouvertes à max 3 actives.`, payload: { score: s.productivityScore } });
  }
  if (s.financeScore < 40) {
    out.push({ type: 'optim_finance', description: `Santé financière à ${s.financeScore}/100. Identifier la plus grosse catégorie de dépense.`, payload: { score: s.financeScore } });
  }
  return out;
}

function persistFresh(db, suggestions, userId) {
  const existing = new Set(
    db.prepare(`SELECT description FROM ai_actions WHERE statut = 'suggere' AND user_id = ?`).all(userId).map(r => r.description)
  );
  const insert = db.prepare(`INSERT INTO ai_actions (user_id, type, description, payload) VALUES (?, ?, ?, ?)`);
  const inserted = [];
  for (const s of suggestions) {
    if (!s?.type || !s?.description) continue;
    if (existing.has(s.description)) continue;
    const info = insert.run(userId, s.type, s.description, s.payload ? JSON.stringify(s.payload) : null);
    inserted.push({ id: info.lastInsertRowid, ...s });
  }
  return inserted;
}
