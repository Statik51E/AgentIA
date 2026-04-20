/**
 * Agent autonome client-side : génère suggestions + exécute actions.
 * Remplace suggestionsEngine + actionExecutor du backend.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firestore.js';
import { auth } from './firebase.js';
import { dailyScores } from './statsClient.js';
import { planSuggestions, structureProjectFromIdea } from './aiClient.js';
import {
  listProjects, addAction, setActionStatus, addProject, addTask,
  patchProject, patchFinance, addFixed, delIdea,
} from './dataService.js';

function userCol(name) {
  const u = auth.currentUser;
  if (!u) throw new Error('Non authentifié');
  return collection(db, 'users', u.uid, name);
}

async function readAll(name) {
  const snap = await getDocs(userCol(name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function generateSuggestions() {
  const context = await buildContext();
  let plan = null;
  try { plan = await planSuggestions(context); } catch {}
  const suggestions = plan !== null ? plan : await fallbackRules(context);
  return await persistFresh(suggestions);
}

async function buildContext() {
  const [scores, projets, taches, idees, finances, charges, ouvertes] = await Promise.all([
    dailyScores(),
    readAll('projects'),
    readAll('tasks'),
    readAll('ideas'),
    readAll('finances'),
    readAll('fixed_expenses'),
    getDocs(query(userCol('ai_actions'), where('statut', '==', 'suggere'))).then(s => s.docs.map(d => d.data())),
  ]);
  return {
    date: new Date().toISOString(),
    scores,
    projets: projets.map(p => ({ id: p.id, nom: p.nom, statut: p.statut, priorite: p.priorite, createdAt: p.createdAt })),
    taches_ouvertes: taches.filter(t => t.statut !== 'termine').slice(0, 40),
    idees: idees.slice(0, 20).map(i => ({ id: i.id, contenu: (i.contenu || '').slice(0, 200), createdAt: i.createdAt })),
    finances_recentes: finances.slice(0, 60),
    charges_fixes: charges,
    suggestions_ouvertes: ouvertes.map(a => ({ type: a.type, description: a.description })),
  };
}

async function fallbackRules(ctx) {
  const out = [];
  const now = Date.now();
  for (const a of (ctx.scores?.anomalies || [])) {
    out.push({ type: 'finance_anomalie', description: a.message, payload: { categorie: a.categorie, max: a.max, median: a.median } });
  }
  for (const p of ctx.projets.filter(p => p.statut === 'todo' && p.createdAt && now - Date.parse(p.createdAt) > 7 * 86400000).slice(0, 5)) {
    out.push({ type: 'projet_stagnant', description: `Projet "${p.nom}" en attente depuis +7j.`, payload: { projectId: p.id } });
  }
  for (const i of ctx.idees.filter(i => i.createdAt && now - Date.parse(i.createdAt) > 3 * 86400000).slice(0, 5)) {
    out.push({ type: 'idee_a_convertir', description: `Idée "${(i.contenu || '').slice(0, 60)}…" dort depuis +3j.`, payload: { ideaId: i.id } });
  }
  const s = ctx.scores;
  if (s.productivityScore < 40 && s.counts.taches_ouvertes > 3) {
    out.push({ type: 'optim_productivite', description: `Productivité à ${s.productivityScore}/100. Max 3 tâches actives.`, payload: { score: s.productivityScore } });
  }
  if (s.financeScore < 40) {
    out.push({ type: 'optim_finance', description: `Santé financière à ${s.financeScore}/100. Identifier la plus grosse dépense.`, payload: { score: s.financeScore } });
  }
  return out;
}

async function persistFresh(suggestions) {
  const existing = new Set((await readAll('ai_actions')).filter(a => a.statut === 'suggere').map(a => a.description));
  const out = [];
  for (const s of suggestions) {
    if (!s?.type || !s?.description) continue;
    if (existing.has(s.description)) continue;
    const created = await addAction({ type: s.type, description: s.description, payload: s.payload || null });
    out.push(created);
  }
  return out;
}

// ---------------------------------------------------------------------
// EXECUTE ACTION
// ---------------------------------------------------------------------
export async function executeAction(action) {
  const { type, payload } = action;
  switch (type) {
    case 'projet_stagnant': {
      if (!payload?.projectId) return { noop: true };
      await patchProject(payload.projectId, { statut: 'en_cours' });
      return { effect: 'projet relancé' };
    }
    case 'archiver_projet': {
      if (!payload?.projectId) return { noop: true };
      await patchProject(payload.projectId, { statut: 'termine' });
      return { effect: 'projet archivé' };
    }
    case 'creer_projet': {
      const nom = String(payload?.nom || '').trim();
      if (!nom) return { noop: true };
      const p = await addProject({ nom, description: String(payload?.description || '') });
      return { effect: 'projet créé', projectId: p.id };
    }
    case 'creer_tache': {
      const projectId = payload?.projectId;
      const titre = String(payload?.titre || '').trim();
      if (!projectId || !titre) return { noop: true };
      const t = await addTask(projectId, { titre });
      return { effect: 'tâche créée', taskId: t.id };
    }
    case 'idee_a_convertir': {
      if (!payload?.ideaId) return { noop: true };
      const ideas = await readAll('ideas');
      const idea = ideas.find(i => i.id === payload.ideaId);
      if (!idea) return { noop: true };
      let blueprint = null;
      try { blueprint = await structureProjectFromIdea(idea.contenu); } catch {}
      const nom = blueprint?.nom || (idea.contenu || '').split('\n')[0].slice(0, 80) || "Projet issu d'une idée";
      const description = blueprint?.description || idea.structure || idea.contenu || '';
      const p = await addProject({ nom, description });
      for (const t of (blueprint?.taches || [])) {
        if (t) await addTask(p.id, { titre: String(t).slice(0, 200) });
      }
      await delIdea(payload.ideaId);
      return { effect: 'idée → projet', projectId: p.id };
    }
    case 'categoriser_finance': {
      const financeId = payload?.financeId;
      const categorie = String(payload?.categorie || '').trim();
      if (!financeId || !categorie) return { noop: true };
      await patchFinance(financeId, { categorie });
      return { effect: 'catégorie mise à jour' };
    }
    case 'marquer_depense_fixe': {
      const libelle = String(payload?.libelle || '').trim();
      const montant = Number(payload?.montant);
      if (!libelle || !montant || montant <= 0) return { noop: true };
      const jour_mois = Number.isInteger(payload?.jour_mois) ? Math.min(31, Math.max(1, payload.jour_mois)) : null;
      const f = await addFixed({ libelle, montant: Math.abs(montant), categorie: payload?.categorie || null, jour_mois });
      return { effect: 'charge fixe créée', fixedId: f.id };
    }
    case 'finance_anomalie':
    case 'optim_finance':
    case 'optim_productivite':
      return { effect: 'acknowledged', type };
    default:
      return { effect: 'logged', type };
  }
}

export async function validateAction(id) {
  const all = await readAll('ai_actions');
  const action = all.find(a => a.id === id);
  if (!action) throw new Error('action introuvable');
  await setActionStatus(id, 'execute');
  try {
    const result = await executeAction(action);
    return { ok: true, result };
  } catch (e) {
    await setActionStatus(id, 'erreur');
    throw e;
  }
}

export async function rejectAction(id) {
  await setActionStatus(id, 'rejete');
  return { ok: true };
}
