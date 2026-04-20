import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firestore.js';
import { auth } from './firebase.js';

function userCol(name) {
  const u = auth.currentUser;
  if (!u) throw new Error('Non authentifié');
  return collection(db, 'users', u.uid, name);
}

export async function monthlyStats(monthStr = null) {
  const { monthStart, monthEnd, daysInMonth, dayOfMonth, isCurrent } = monthRange(monthStr);
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);

  const [finSnap, budSnap, fixSnap] = await Promise.all([
    getDocs(userCol('finances')),
    getDocs(userCol('budgets')),
    getDocs(userCol('fixed_expenses')),
  ]);

  const fins = finSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const budgets = budSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.actif !== false);
  const fixed = fixSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.actif !== false);

  const monthFins = fins.filter(f => f.date >= monthStart && f.date < monthEnd && (f.categorie || '') !== 'transfert');
  const depenses = monthFins.filter(f => f.type === 'depense');
  const revenus = monthFins.filter(f => f.type === 'revenu');

  const perCatMap = {};
  for (const d of depenses) {
    const key = d.categorie || '(non catégorisé)';
    perCatMap[key] = perCatMap[key] || { categorie: key, total: 0, count: 0 };
    perCatMap[key].total += d.montant || 0;
    perCatMap[key].count += 1;
  }
  const perCatRows = Object.values(perCatMap).sort((a, b) => b.total - a.total);

  const depenseMois = perCatRows.reduce((s, r) => s + (r.total || 0), 0);
  const revenuMois = revenus.reduce((s, r) => s + (r.montant || 0), 0);

  const byCategory = {};
  for (const b of budgets) {
    byCategory[b.categorie] = {
      categorie: b.categorie, limite: b.limite_mensuelle, budgetId: b.id,
      depense: 0, count: 0, pourcentage: 0, reste: b.limite_mensuelle,
    };
  }
  for (const c of perCatRows) {
    const key = c.categorie;
    if (!byCategory[key]) {
      byCategory[key] = { categorie: key, limite: null, depense: 0, count: 0, pourcentage: null, reste: null };
    }
    byCategory[key].depense = c.total;
    byCategory[key].count = c.count;
    if (byCategory[key].limite) {
      byCategory[key].pourcentage = Math.round((c.total / byCategory[key].limite) * 100);
      byCategory[key].reste = byCategory[key].limite - c.total;
    }
  }

  const chargesFixes = fixed.reduce((s, f) => s + (f.montant || 0), 0);

  const fixedByCatMap = {};
  for (const f of fixed) {
    const k = f.categorie || '(non catégorisé)';
    fixedByCatMap[k] = fixedByCatMap[k] || { categorie: k, total: 0, count: 0 };
    fixedByCatMap[k].total += f.montant || 0;
    fixedByCatMap[k].count += 1;
  }
  const fixedByCatRows = Object.values(fixedByCatMap).sort((a, b) => b.total - a.total);

  const totauxMap = {};
  for (const c of perCatRows) {
    totauxMap[c.categorie] = {
      categorie: c.categorie,
      variable: +(c.total || 0).toFixed(2), nbVariable: c.count || 0,
      fixe: 0, nbFixe: 0,
      total: +(c.total || 0).toFixed(2),
    };
  }
  for (const f of fixedByCatRows) {
    if (!totauxMap[f.categorie]) totauxMap[f.categorie] = { categorie: f.categorie, variable: 0, nbVariable: 0, fixe: 0, nbFixe: 0, total: 0 };
    totauxMap[f.categorie].fixe = +(f.total || 0).toFixed(2);
    totauxMap[f.categorie].nbFixe = f.count || 0;
    totauxMap[f.categorie].total = +(totauxMap[f.categorie].variable + totauxMap[f.categorie].fixe).toFixed(2);
  }
  const totauxParCategorie = Object.values(totauxMap).sort((a, b) => b.total - a.total);

  const projectionMois = isCurrent && dayOfMonth > 0
    ? Math.round((depenseMois / dayOfMonth) * daysInMonth)
    : +depenseMois.toFixed(2);
  const budgetDisponible = revenuMois - depenseMois - chargesFixes;

  const depassements = [];
  const alertes = [];
  for (const v of Object.values(byCategory)) {
    if (v.limite && v.depense > v.limite) {
      depassements.push({ categorie: v.categorie, depasse: +(v.depense - v.limite).toFixed(2), limite: v.limite, depense: v.depense });
    } else if (v.limite && v.pourcentage >= 80) {
      alertes.push({ categorie: v.categorie, pourcentage: v.pourcentage, reste: +v.reste.toFixed(2) });
    }
  }

  return {
    mois: monthStart.slice(0, 7),
    jour: dayOfMonth,
    joursDansMois: daysInMonth,
    joursRestants: daysRemaining,
    isCurrent,
    revenuMois,
    depenseMois: +depenseMois.toFixed(2),
    chargesFixes,
    budgetDisponible: +budgetDisponible.toFixed(2),
    projectionMois,
    perCategorie: Object.values(byCategory).sort((a, b) => (b.depense || 0) - (a.depense || 0)),
    totauxParCategorie,
    chargesFixesParCategorie: fixedByCatRows.map(r => ({ categorie: r.categorie, total: +(r.total || 0).toFixed(2), count: r.count || 0 })),
    depassements,
    alertes,
  };
}

export async function monthlyHistory(months = 12) {
  const snap = await getDocs(userCol('finances'));
  const fins = snap.docs.map(d => d.data()).filter(f => (f.categorie || '') !== 'transfert');
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = toMonthStart(d);
    const endD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = toMonthStart(endD);
    const monthFins = fins.filter(f => f.date >= start && f.date < end);
    const revenus  = monthFins.filter(f => f.type === 'revenu').reduce((s, f) => s + (f.montant || 0), 0);
    const depenses = monthFins.filter(f => f.type === 'depense').reduce((s, f) => s + (f.montant || 0), 0);
    out.push({
      mois: start.slice(0, 7),
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      revenus: +revenus.toFixed(2),
      depenses: +depenses.toFixed(2),
      solde: +(revenus - depenses).toFixed(2),
      nb: monthFins.length,
    });
  }
  return out;
}

function monthRange(monthStr) {
  const now = new Date();
  let d;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number);
    d = new Date(y, m - 1, 1);
  } else {
    d = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const monthStart = toMonthStart(d);
  const endD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const monthEnd = toMonthStart(endD);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const dayOfMonth = isCurrent ? now.getDate() : daysInMonth;
  return { monthStart, monthEnd, daysInMonth, dayOfMonth, isCurrent };
}

function toMonthStart(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
}

// ---------------------------------------------------------------------
// SCORING + DAILY
// ---------------------------------------------------------------------
export async function dailyScores() {
  const [finSnap, taskSnap, projSnap, ideaSnap, actSnap] = await Promise.all([
    getDocs(userCol('finances')),
    getDocs(userCol('tasks')),
    getDocs(userCol('projects')),
    getDocs(userCol('ideas')),
    getDocs(query(userCol('ai_actions'), where('statut', '==', 'suggere'))),
  ]);
  const fins = finSnap.docs.map(d => d.data());
  const tasks = taskSnap.docs.map(d => d.data());
  const projects = projSnap.docs.map(d => d.data());
  const fin = financeScore(fins);
  const prod = productivityScore(tasks, projects);
  const counts = {
    projets: projects.length,
    taches_ouvertes: tasks.filter(t => t.statut !== 'termine').length,
    idees: ideaSnap.size,
    actions_ouvertes: actSnap.size,
  };
  const resume = buildDailyResume(fin, prod, counts);
  return { date: new Date().toISOString().slice(0, 10), financeScore: fin, productivityScore: prod, counts, resume };
}

function financeScore(fins) {
  const r = fins.filter(f => f.type === 'revenu').reduce((s, f) => s + (f.montant || 0), 0);
  const d = fins.filter(f => f.type === 'depense').reduce((s, f) => s + (f.montant || 0), 0);
  if (!r && !d) return 50;
  const ratio = r > 0 ? d / r : 2;
  let score = 100 - Math.min(100, Math.round(ratio * 50));
  if (r > 0 && d < r * 0.6) score += 10;
  return Math.max(0, Math.min(100, score));
}

function productivityScore(tasks, projects) {
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
