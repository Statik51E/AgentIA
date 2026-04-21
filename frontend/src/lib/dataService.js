import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit as qLimit, serverTimestamp, writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firestore.js';
import { auth } from './firebase.js';

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error('Non authentifié');
  return u.uid;
}

function userCol(name) { return collection(db, 'users', uid(), name); }
function userDoc(name, id) { return doc(db, 'users', uid(), name, String(id)); }

function nowIso() { return new Date().toISOString(); }
function snapDoc(s) { return { id: s.id, ...s.data() }; }
function snapAll(s) { return s.docs.map(snapDoc); }

// ---------------------------------------------------------------------
// REAL-TIME SUBSCRIPTIONS — onSnapshot listeners
// ---------------------------------------------------------------------
/**
 * Écoute une collection utilisateur en temps réel.
 * Appelle `onChange()` à chaque ajout / modification / suppression.
 * Renvoie une fonction `unsubscribe()`.
 */
export function subscribeCollection(name, onChange) {
  try {
    return onSnapshot(userCol(name), () => { try { onChange?.(); } catch {} }, () => {});
  } catch {
    return () => {};
  }
}

/**
 * Écoute plusieurs collections en même temps.
 * `onChange` est débounced pour éviter un burst d'updates.
 */
export function subscribeCollections(names, onChange, { debounceMs = 120 } = {}) {
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange?.(), debounceMs);
  };
  const unsubs = names.map(n => subscribeCollection(n, fire));
  return () => { clearTimeout(timer); unsubs.forEach(u => { try { u(); } catch {} }); };
}

// ---------------------------------------------------------------------
// USER SETTINGS (Groq API key, preferences)
// ---------------------------------------------------------------------
export async function getSettings() {
  const s = await getDoc(doc(db, 'users', uid()));
  return s.exists() ? s.data().settings || {} : {};
}

export async function saveSettings(patch) {
  const ref = doc(db, 'users', uid());
  const cur = await getDoc(ref);
  const existing = cur.exists() ? (cur.data().settings || {}) : {};
  await setDoc(ref, { settings: { ...existing, ...patch }, updatedAt: nowIso() }, { merge: true });
  return { ...existing, ...patch };
}

// ---------------------------------------------------------------------
// FINANCES (transactions)
// ---------------------------------------------------------------------
export async function listFinances(filters = {}) {
  const { type, categorie, accountId, from, to, q: search, limit = 500 } = filters;
  const clauses = [];
  if (type === 'revenu' || type === 'depense') clauses.push(where('type', '==', type));
  if (categorie) clauses.push(where('categorie', '==', String(categorie).toLowerCase()));
  if (accountId) clauses.push(where('account_id', '==', String(accountId)));
  if (from) clauses.push(where('date', '>=', from));
  if (to)   clauses.push(where('date', '<=', to));
  clauses.push(orderBy('date', 'desc'));
  clauses.push(qLimit(Math.min(Number(limit) || 500, 2000)));
  const snap = await getDocs(query(userCol('finances'), ...clauses));
  let rows = snapAll(snap);
  if (search) {
    const s = String(search).toLowerCase();
    rows = rows.filter(r =>
      (r.note && r.note.toLowerCase().includes(s)) ||
      (r.categorie && r.categorie.toLowerCase().includes(s))
    );
  }
  return rows;
}

export async function addFinance(data) {
  const { type, montant, categorie, note, date, account_id } = data || {};
  if (!['revenu', 'depense'].includes(type)) throw new Error('type invalide');
  if (typeof montant !== 'number' || montant <= 0) throw new Error('montant invalide');
  const row = {
    type, montant,
    categorie: categorie ? String(categorie).toLowerCase() : null,
    note: note || null,
    date: date || nowIso(),
    account_id: account_id ? String(account_id) : null,
    createdAt: nowIso(),
  };
  const ref = await addDoc(userCol('finances'), row);
  return { id: ref.id, ...row };
}

export async function patchFinance(id, data) {
  const patch = {};
  if (data.type && ['revenu','depense'].includes(data.type)) patch.type = data.type;
  if (typeof data.montant === 'number' && data.montant > 0) patch.montant = data.montant;
  if (typeof data.categorie === 'string') patch.categorie = data.categorie.toLowerCase();
  if (typeof data.note === 'string') patch.note = data.note;
  if (typeof data.date === 'string') patch.date = data.date;
  if (data.account_id !== undefined) patch.account_id = data.account_id ? String(data.account_id) : null;
  await updateDoc(userDoc('finances', id), patch);
  const s = await getDoc(userDoc('finances', id));
  return snapDoc(s);
}

export async function delFinance(id) {
  await deleteDoc(userDoc('finances', id));
  return { ok: true };
}

export async function financesSummary() {
  const [fSnap, aSnap, fxSnap] = await Promise.all([
    getDocs(userCol('finances')),
    getDocs(userCol('accounts')),
    getDocs(query(userCol('fixed_expenses'), where('actif', '==', true))),
  ]);
  const rows = snapAll(fSnap);
  const accounts = snapAll(aSnap);
  const revenus = rows.filter(r => r.type === 'revenu').reduce((s, r) => s + (r.montant || 0), 0);
  const depenses = rows.filter(r => r.type === 'depense').reduce((s, r) => s + (r.montant || 0), 0);
  const solde_initial_total = accounts.reduce((s, a) => s + (Number(a.solde_initial) || 0), 0);
  const byCatMap = {};
  for (const r of rows) {
    const k = `${r.categorie || ''}|${r.type}`;
    byCatMap[k] = byCatMap[k] || { categorie: r.categorie, type: r.type, total: 0 };
    byCatMap[k].total += r.montant || 0;
  }
  const byCat = Object.values(byCatMap).sort((a, b) => b.total - a.total);
  const charges_fixes = snapAll(fxSnap).reduce((s, r) => s + (r.montant || 0), 0);
  const anomalies = detectAnomalies(rows);
  const solde = solde_initial_total + revenus - depenses;
  return { revenus, depenses, solde, solde_initial_total, byCat, anomalies, charges_fixes, solde_apres_charges: solde - charges_fixes };
}

function detectAnomalies(rows) {
  const cats = rows.filter(r => r.type === 'depense' && r.categorie);
  if (cats.length < 3) return [];
  const groups = {};
  cats.forEach(r => { (groups[r.categorie] ||= []).push(r.montant); });
  const out = [];
  for (const [cat, vals] of Object.entries(groups)) {
    if (vals.length < 3) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = Math.max(...vals);
    if (max > median * 3 && max > 50) {
      out.push({ categorie: cat, max, median, message: `Dépense ${cat} anormalement élevée (${max}€ vs médiane ${median}€)` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// BUDGETS
// ---------------------------------------------------------------------
export async function listBudgets() {
  const snap = await getDocs(query(userCol('budgets'), orderBy('categorie')));
  return snapAll(snap);
}

export async function addBudget({ categorie, limite_mensuelle }) {
  if (!categorie) throw new Error('categorie requise');
  if (typeof limite_mensuelle !== 'number' || limite_mensuelle <= 0) throw new Error('limite invalide');
  const cat = categorie.trim().toLowerCase();
  const existing = await getDocs(query(userCol('budgets'), where('categorie', '==', cat)));
  if (!existing.empty) throw new Error('budget déjà défini pour cette catégorie');
  const row = { categorie: cat, limite_mensuelle, actif: true, createdAt: nowIso() };
  const ref = await addDoc(userCol('budgets'), row);
  return { id: ref.id, ...row };
}

export async function patchBudget(id, data) {
  const patch = {};
  if (typeof data.categorie === 'string') patch.categorie = data.categorie.trim().toLowerCase();
  if (typeof data.limite_mensuelle === 'number') patch.limite_mensuelle = data.limite_mensuelle;
  if (typeof data.actif === 'boolean') patch.actif = data.actif;
  await updateDoc(userDoc('budgets', id), patch);
  return snapDoc(await getDoc(userDoc('budgets', id)));
}

export async function delBudget(id) {
  await deleteDoc(userDoc('budgets', id));
  return { ok: true };
}

// ---------------------------------------------------------------------
// FIXED EXPENSES
// ---------------------------------------------------------------------
export async function listFixed() {
  const snap = await getDocs(query(userCol('fixed_expenses'), orderBy('createdAt', 'desc')));
  return snapAll(snap);
}

export async function addFixed({ libelle, montant, categorie, jour_mois, actif }) {
  if (!libelle) throw new Error('libelle requis');
  if (typeof montant !== 'number' || montant <= 0) throw new Error('montant invalide');
  const row = {
    libelle: libelle.trim(),
    montant,
    categorie: categorie || null,
    jour_mois: Number.isInteger(jour_mois) ? jour_mois : null,
    actif: actif === false ? false : true,
    createdAt: nowIso(),
  };
  const ref = await addDoc(userCol('fixed_expenses'), row);
  return { id: ref.id, ...row };
}

export async function patchFixed(id, data) {
  const patch = {};
  if (typeof data.libelle === 'string') patch.libelle = data.libelle.trim();
  if (typeof data.montant === 'number') patch.montant = data.montant;
  if (data.categorie !== undefined) patch.categorie = data.categorie;
  if (data.jour_mois !== undefined) patch.jour_mois = data.jour_mois;
  if (typeof data.actif === 'boolean') patch.actif = data.actif;
  await updateDoc(userDoc('fixed_expenses', id), patch);
  return snapDoc(await getDoc(userDoc('fixed_expenses', id)));
}

export async function delFixed(id) {
  await deleteDoc(userDoc('fixed_expenses', id));
  return { ok: true };
}

// ---------------------------------------------------------------------
// ACCOUNTS
// ---------------------------------------------------------------------
export async function listAccounts() {
  const [aSnap, fSnap] = await Promise.all([
    getDocs(query(userCol('accounts'), orderBy('createdAt'))),
    getDocs(userCol('finances')),
  ]);
  const accounts = snapAll(aSnap);
  const balances = {};
  for (const f of snapAll(fSnap)) {
    if (!f.account_id) continue;
    balances[f.account_id] = balances[f.account_id] || { entrees: 0, sorties: 0 };
    if (f.type === 'revenu')  balances[f.account_id].entrees += f.montant || 0;
    if (f.type === 'depense') balances[f.account_id].sorties += f.montant || 0;
  }
  return accounts.map(a => {
    const b = balances[a.id] || { entrees: 0, sorties: 0 };
    const solde = (a.solde_initial || 0) + b.entrees - b.sorties;
    return { ...a, entrees: b.entrees, sorties: b.sorties, solde: +solde.toFixed(2) };
  });
}

export async function addAccount({ nom, type, solde_initial, couleur }) {
  if (!nom) throw new Error('nom requis');
  const t = ['courant','epargne','espece','credit','autre'].includes(type) ? type : 'courant';
  const row = {
    nom: nom.trim(),
    type: t,
    solde_initial: Number(solde_initial) || 0,
    couleur: couleur || null,
    createdAt: nowIso(),
  };
  const ref = await addDoc(userCol('accounts'), row);
  return { id: ref.id, ...row };
}

export async function patchAccount(id, data) {
  const patch = {};
  if (typeof data.nom === 'string') patch.nom = data.nom.trim();
  if (data.type && ['courant','epargne','espece','credit','autre'].includes(data.type)) patch.type = data.type;
  if (typeof data.solde_initial === 'number') patch.solde_initial = data.solde_initial;
  if (data.couleur !== undefined) patch.couleur = data.couleur;
  await updateDoc(userDoc('accounts', id), patch);
  return snapDoc(await getDoc(userDoc('accounts', id)));
}

export async function delAccount(id) {
  const sid = String(id);
  const fSnap = await getDocs(query(userCol('finances'), where('account_id', '==', sid)));
  const batch = writeBatch(db);
  fSnap.docs.forEach(d => batch.update(d.ref, { account_id: null }));
  batch.delete(userDoc('accounts', sid));
  await batch.commit();
  return { ok: true };
}

export async function transferBetweenAccounts({ from_id, to_id, montant, note }) {
  const from = String(from_id), to = String(to_id);
  const m = Number(montant);
  if (!from || !to || from === to) throw new Error('comptes invalides');
  if (!m || m <= 0) throw new Error('montant invalide');
  const [a, b] = await Promise.all([getDoc(userDoc('accounts', from)), getDoc(userDoc('accounts', to))]);
  if (!a.exists() || !b.exists()) throw new Error('un des comptes est introuvable');
  const label = note ? String(note).slice(0, 120) : 'transfert';
  const now = nowIso();
  await Promise.all([
    addDoc(userCol('finances'), { type: 'depense', montant: m, categorie: 'transfert', note: label, account_id: from, date: now, createdAt: now }),
    addDoc(userCol('finances'), { type: 'revenu',  montant: m, categorie: 'transfert', note: label, account_id: to,   date: now, createdAt: now }),
  ]);
  return { ok: true, transferre: m };
}

// ---------------------------------------------------------------------
// SAVINGS GOALS
// ---------------------------------------------------------------------
export async function listGoals() {
  const snap = await getDocs(query(userCol('savings_goals'), orderBy('createdAt', 'desc')));
  return snapAll(snap);
}

export async function addGoal({ nom, cible, actuel, deadline, account_id }) {
  if (!nom) throw new Error('nom requis');
  if (typeof cible !== 'number' || cible <= 0) throw new Error('cible invalide');
  const row = {
    nom: nom.trim(),
    cible,
    actuel: Number(actuel) || 0,
    deadline: deadline || null,
    account_id: account_id ? String(account_id) : null,
    createdAt: nowIso(),
  };
  const ref = await addDoc(userCol('savings_goals'), row);
  return { id: ref.id, ...row };
}

export async function patchGoal(id, data) {
  const patch = {};
  if (typeof data.nom === 'string') patch.nom = data.nom.trim();
  if (typeof data.cible === 'number') patch.cible = data.cible;
  if (typeof data.actuel === 'number') patch.actuel = data.actuel;
  if (typeof data.deadline === 'string') patch.deadline = data.deadline;
  if (data.account_id !== undefined) patch.account_id = data.account_id ? String(data.account_id) : null;
  await updateDoc(userDoc('savings_goals', id), patch);
  return snapDoc(await getDoc(userDoc('savings_goals', id)));
}

export async function contributeGoal(id, montant) {
  const m = Number(montant);
  if (!m) throw new Error('montant requis');
  const ref = userDoc('savings_goals', id);
  const cur = await getDoc(ref);
  if (!cur.exists()) throw new Error('introuvable');
  const newActuel = Math.max(0, (cur.data().actuel || 0) + m);
  await updateDoc(ref, { actuel: newActuel });
  return snapDoc(await getDoc(ref));
}

export async function delGoal(id) {
  await deleteDoc(userDoc('savings_goals', id));
  return { ok: true };
}

// ---------------------------------------------------------------------
// PROJECTS + TASKS
// ---------------------------------------------------------------------
export async function listProjects() {
  const pSnap = await getDocs(query(userCol('projects'), orderBy('priorite', 'desc')));
  const projects = snapAll(pSnap);
  const tSnap = await getDocs(query(userCol('tasks'), orderBy('priorite', 'desc')));
  const tasks = snapAll(tSnap);
  return projects.map(p => ({ ...p, tasks: tasks.filter(t => t.project_id === p.id) }));
}

export async function addProject({ nom, description, intake }) {
  if (!nom) throw new Error('nom requis');
  const priorite = computePriority({ nom, description });
  const row = {
    nom: nom.trim(),
    description: description || null,
    statut: 'todo',
    priorite,
    createdAt: nowIso(),
  };
  if (intake && typeof intake === 'object') row.intake = intake;
  const ref = await addDoc(userCol('projects'), row);
  return { id: ref.id, ...row };
}

export async function patchProject(id, data) {
  const patch = {};
  if (typeof data.nom === 'string') patch.nom = data.nom;
  if (typeof data.description === 'string') patch.description = data.description;
  if (typeof data.statut === 'string') patch.statut = data.statut;
  if (typeof data.priorite === 'number') patch.priorite = data.priorite;
  if (data.mindmap !== undefined) patch.mindmap = data.mindmap;
  if (data.brief !== undefined) patch.brief = data.brief;
  if (data.intake !== undefined) patch.intake = data.intake;
  await updateDoc(userDoc('projects', id), patch);
  return snapDoc(await getDoc(userDoc('projects', id)));
}

export async function delProject(id) {
  const tSnap = await getDocs(query(userCol('tasks'), where('project_id', '==', String(id))));
  const batch = writeBatch(db);
  tSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(userDoc('projects', id));
  await batch.commit();
  return { ok: true };
}

export async function addTask(projectId, { titre }) {
  if (!titre) throw new Error('titre requis');
  const priorite = computePriority({ nom: titre });
  const row = {
    project_id: String(projectId),
    titre: titre.trim(),
    statut: 'todo',
    priorite,
    createdAt: nowIso(),
  };
  const ref = await addDoc(userCol('tasks'), row);
  return { id: ref.id, ...row };
}

export async function patchTask(projectId, taskId, data) {
  const patch = {};
  if (typeof data.titre === 'string') patch.titre = data.titre;
  if (typeof data.statut === 'string') patch.statut = data.statut;
  await updateDoc(userDoc('tasks', taskId), patch);
  return snapDoc(await getDoc(userDoc('tasks', taskId)));
}

export async function delTask(projectId, taskId) {
  await deleteDoc(userDoc('tasks', taskId));
  return { ok: true };
}

function computePriority({ nom = '', description = '' }) {
  const t = `${nom} ${description}`.toLowerCase();
  let p = 1;
  if (/(urgent|asap|critique|bloquant)/.test(t)) p += 4;
  if (/(deadline|livraison|demain|aujourd'hui)/.test(t)) p += 3;
  if (/(important|clé|cle|clef)/.test(t)) p += 2;
  if (/(plus tard|un jour|peut-être|peut etre)/.test(t)) p -= 1;
  return Math.max(0, Math.min(5, p));
}

// ---------------------------------------------------------------------
// IDEAS
// ---------------------------------------------------------------------
export async function listIdeas() {
  const snap = await getDocs(query(userCol('ideas'), orderBy('createdAt', 'desc')));
  return snapAll(snap);
}

export async function addIdea({ contenu, structure, tags }) {
  if (!contenu) throw new Error('contenu requis');
  const row = {
    contenu: contenu.trim(),
    structure: structure || null,
    tags: tags || [],
    createdAt: nowIso(),
    date: nowIso(),
  };
  const ref = await addDoc(userCol('ideas'), row);
  return { id: ref.id, ...row };
}

export async function delIdea(id) {
  await deleteDoc(userDoc('ideas', id));
  return { ok: true };
}

export async function convertIdea(id) {
  const ideaRef = userDoc('ideas', id);
  const snap = await getDoc(ideaRef);
  if (!snap.exists()) throw new Error('idée introuvable');
  const idea = snap.data();
  const nom = (idea.contenu || '').split('\n')[0].slice(0, 80) || "Projet issu d'une idée";
  const pRef = await addDoc(userCol('projects'), {
    nom,
    description: idea.structure || idea.contenu || '',
    statut: 'todo',
    priorite: 3,
    createdAt: nowIso(),
  });
  await deleteDoc(ideaRef);
  return { project: { id: pRef.id, nom, priorite: 3 } };
}

// ---------------------------------------------------------------------
// AI ACTIONS / SUGGESTIONS
// ---------------------------------------------------------------------
export async function listSuggestions() {
  // Tri côté client pour éviter d'exiger un index composite (statut + createdAt)
  const snap = await getDocs(query(userCol('ai_actions'), where('statut', '==', 'suggere')));
  return snapAll(snap).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listActions() {
  const snap = await getDocs(query(userCol('ai_actions'), orderBy('createdAt', 'desc'), qLimit(200)));
  return snapAll(snap);
}

export async function addAction({ type, description, payload, statut = 'suggere' }) {
  const row = {
    type, description,
    payload: payload || null,
    statut,
    createdAt: nowIso(),
    date: nowIso(),
  };
  const ref = await addDoc(userCol('ai_actions'), row);
  return { id: ref.id, ...row };
}

export async function setActionStatus(id, statut) {
  await updateDoc(userDoc('ai_actions', id), { statut });
  return snapDoc(await getDoc(userDoc('ai_actions', id)));
}

// ---------------------------------------------------------------------
// AI LOGS
// ---------------------------------------------------------------------
export async function addAiLog({ type, contenu }) {
  const row = { type, contenu, createdAt: nowIso(), date: nowIso() };
  const ref = await addDoc(userCol('ai_logs'), row);
  return { id: ref.id, ...row };
}

export async function listAiLogs() {
  const snap = await getDocs(query(userCol('ai_logs'), orderBy('createdAt', 'desc'), qLimit(100)));
  return snapAll(snap);
}

// ---------------------------------------------------------------------
// STATEMENT IMPORT (write multiple finances + fixed at once)
// ---------------------------------------------------------------------
export async function importStatement({ transactions = [], depenses_fixes = [], account_id }) {
  const accId = account_id ? String(account_id) : null;
  const now = nowIso();
  let txCount = 0, fixedCount = 0;
  const batch = writeBatch(db);
  for (const t of transactions) {
    if (!t?.montant || !['revenu', 'depense'].includes(t?.type)) continue;
    const ref = doc(userCol('finances'));
    batch.set(ref, {
      type: t.type,
      montant: Math.abs(Number(t.montant)),
      categorie: t.categorie ? String(t.categorie).toLowerCase() : null,
      note: t.libelle || null,
      date: t.date || now,
      account_id: accId,
      createdAt: now,
    });
    txCount++;
  }
  for (const f of depenses_fixes) {
    if (!f?.libelle || !f?.montant) continue;
    const ref = doc(userCol('fixed_expenses'));
    batch.set(ref, {
      libelle: String(f.libelle).slice(0, 120),
      montant: Math.abs(Number(f.montant)),
      categorie: f.categorie || null,
      jour_mois: Number.isInteger(f.jour_mois) ? f.jour_mois : null,
      actif: true,
      createdAt: now,
    });
    fixedCount++;
  }
  await batch.commit();
  return { transactions_importees: txCount, charges_fixes_ajoutees: fixedCount };
}
