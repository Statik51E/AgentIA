import { getSettings } from './dataService.js';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function groqKey() {
  const s = await getSettings();
  const k = s?.groqApiKey;
  if (!k) throw new Error('Ajoute ta clé API Groq dans les Paramètres pour utiliser l\'IA.');
  return { key: k, model: s?.groqModel || DEFAULT_MODEL };
}

async function callGroq(messages, { json = true } = {}) {
  const { key, model } = await groqKey();
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Groq ${r.status}: ${txt.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

function safeJson(s, fallback = {}) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---------------------------------------------------------------------
// ANALYZE ENTRY (free-form text → analysis/structure/improvements/actions)
// ---------------------------------------------------------------------
const ANALYZE_SYSTEM = `Tu es le CORE IA. Tu es direct, logique, orienté résultat, critique si nécessaire.
Tu dois : analyser, structurer, optimiser, proposer des actions concrètes, challenger, améliorer.
Réponds STRICTEMENT en JSON valide, sans markdown, au format :
{"analyse":"","structure":"","ameliorations":"","actions":[]}
"actions" est un tableau de chaînes courtes et impératives.`;

export function detectEntryType(text) {
  const t = (text || '').toLowerCase();
  if (/[\-+]?\s?\d+[.,]?\d*\s?(€|eur|euros|\$|usd)/.test(t) || /(revenu|salaire|dépense|depense|facture|achat|loyer)/.test(t)) return 'finance';
  if (/(projet|livrable|deadline|sprint|étape|etape|milestone|roadmap)/.test(t)) return 'projet';
  if (/(idée|idee|concept|brainstorm|hypothèse|hypothese|et si)/.test(t)) return 'idee';
  if (/(tâche|tache|todo|à faire|a faire)/.test(t)) return 'tache';
  return 'libre';
}

export async function analyzeEntry(entree, type) {
  const content = await callGroq([
    { role: 'system', content: ANALYZE_SYSTEM },
    { role: 'user', content: `Type détecté : ${type}\nEntrée utilisateur :\n${entree}` },
  ]);
  const parsed = safeJson(content);
  return {
    analyse: String(parsed.analyse || ''),
    structure: String(parsed.structure || ''),
    ameliorations: String(parsed.ameliorations || ''),
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
  };
}

export async function structureIdea(contenu) {
  const type = 'idee';
  const out = await analyzeEntry(contenu, type);
  return {
    structure: out.structure || contenu,
    tags: extractTags(contenu),
  };
}

function extractTags(text) {
  const bag = new Set();
  const t = (text || '').toLowerCase();
  ['finance','projet','idée','tâche','urgent','optimisation','revenu','dépense']
    .forEach(k => { if (t.includes(k)) bag.add(k); });
  const hashes = (text.match(/#[\p{L}0-9_-]+/gu) || []).map(h => h.slice(1).toLowerCase());
  hashes.forEach(h => bag.add(h));
  return [...bag];
}

// ---------------------------------------------------------------------
// STATEMENT ANALYSIS
// ---------------------------------------------------------------------
const STATEMENT_SYSTEM = `Tu es CORE IA, analyste financier. Tu reçois un relevé de compte bancaire en texte brut.
Extrait chaque transaction et identifie les charges récurrentes (loyer, abonnements, assurances, crédits, énergie, télécom, etc.).

Réponds STRICTEMENT en JSON :
{
  "transactions": [
    {"date":"YYYY-MM-DD","libelle":"...","montant": number_positif, "type":"revenu"|"depense","categorie":"..."}
  ],
  "depenses_fixes": [
    {"libelle":"...","montant": number_positif, "categorie":"...", "jour_mois": number_or_null}
  ],
  "resume": "synthèse en 2-3 phrases"
}

Règles :
- "montant" toujours POSITIF (signe géré par "type").
- "categorie" courte et normalisée (loyer, courses, transport, abonnement, salaire, remboursement, etc.).
- "depenses_fixes" = opérations qui reviennent chaque mois.
- Ne devine pas : si un champ manque dans le relevé, mets null ou ignore la ligne.
- Retourne jusqu'à 100 transactions max.`;

export async function analyzeStatement(texte) {
  if (!texte || typeof texte !== 'string') throw new Error('texte du relevé requis');
  const content = await callGroq([
    { role: 'system', content: STATEMENT_SYSTEM },
    { role: 'user', content: texte.slice(0, 30_000) },
  ]);
  return normalizeStatement(safeJson(content));
}

function normalizeStatement(raw) {
  const transactions = Array.isArray(raw?.transactions) ? raw.transactions : [];
  const fixed = Array.isArray(raw?.depenses_fixes) ? raw.depenses_fixes : [];
  return {
    transactions: transactions.slice(0, 200).map(t => ({
      date: normalizeDate(t?.date),
      libelle: String(t?.libelle || '').slice(0, 200),
      montant: Math.abs(Number(t?.montant) || 0),
      type: t?.type === 'revenu' ? 'revenu' : 'depense',
      categorie: t?.categorie ? String(t.categorie).slice(0, 60) : null,
    })).filter(t => t.montant > 0 && t.libelle),
    depenses_fixes: fixed.slice(0, 40).map(f => ({
      libelle: String(f?.libelle || '').slice(0, 120),
      montant: Math.abs(Number(f?.montant) || 0),
      categorie: f?.categorie ? String(f.categorie).slice(0, 60) : null,
      jour_mois: Number.isInteger(f?.jour_mois) ? Math.min(31, Math.max(1, f.jour_mois)) : null,
    })).filter(f => f.montant > 0 && f.libelle),
    resume: String(raw?.resume || ''),
  };
}

function normalizeDate(s) {
  if (!s) return new Date().toISOString().slice(0, 10);
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = String(s).match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// FINANCE ADVICE
// ---------------------------------------------------------------------
const ADVICE_SYSTEM = `Tu es CORE IA, coach financier personnel direct et précis.
Tu reçois les statistiques financières du mois en cours (revenus, dépenses par catégorie, budgets, projections, charges fixes, dépassements).
Tu dois produire des conseils courts, actionnables et personnalisés.

Réponds STRICTEMENT en JSON :
{
  "conseils":[
    {"priorite":"haute"|"moyenne"|"basse","titre":"...","message":"...","categorie":"..."}
  ],
  "verdict":"phrase synthèse du mois (1-2 lignes)"
}

Règles :
- 2 à 6 conseils, en français, ton direct (tu), phrases courtes.
- Priorité "haute" UNIQUEMENT pour : dépassement de budget, projection > revenu, catégorie qui explose.
- Si tout va bien : félicite sobrement et propose une optimisation.
- "categorie" = la catégorie concernée ou "global".`;

export async function generateFinanceAdvice(stats) {
  try {
    const content = await callGroq([
      { role: 'system', content: ADVICE_SYSTEM },
      { role: 'user', content: JSON.stringify(stats) },
    ]);
    const parsed = safeJson(content);
    return {
      conseils: Array.isArray(parsed.conseils) ? parsed.conseils.slice(0, 8).map(c => ({
        priorite: ['haute','moyenne','basse'].includes(c?.priorite) ? c.priorite : 'moyenne',
        titre: String(c?.titre || '').slice(0, 120),
        message: String(c?.message || '').slice(0, 400),
        categorie: String(c?.categorie || 'global').slice(0, 40),
      })) : [],
      verdict: String(parsed.verdict || '').slice(0, 300),
    };
  } catch (e) {
    return { conseils: fallbackAdvice(stats), verdict: fallbackVerdict(stats), error: e.message };
  }
}

function fallbackAdvice(stats) {
  const out = [];
  for (const d of (stats?.depassements || [])) {
    out.push({ priorite: 'haute', titre: `Budget ${d.categorie} dépassé`, message: `Tu as dépensé ${d.depense}€ pour une limite de ${d.limite}€ (+${d.depasse}€).`, categorie: d.categorie });
  }
  for (const a of (stats?.alertes || [])) {
    out.push({ priorite: 'moyenne', titre: `Budget ${a.categorie} à ${a.pourcentage}%`, message: `Il te reste ${a.reste}€ pour le mois.`, categorie: a.categorie });
  }
  if (stats?.projectionMois > stats?.revenuMois && stats?.revenuMois > 0) {
    out.push({ priorite: 'haute', titre: 'Projection au-dessus du revenu', message: `Au rythme actuel tu dépenseras ${stats.projectionMois}€ ce mois pour ${stats.revenuMois}€ de revenus.`, categorie: 'global' });
  }
  if (out.length === 0) {
    out.push({ priorite: 'basse', titre: 'Tout est sous contrôle', message: 'Continue, pense à mettre une part en épargne.', categorie: 'global' });
  }
  return out;
}

function fallbackVerdict(stats) {
  if (!stats) return '';
  const s = stats.budgetDisponible >= 0 ? 'équilibré' : 'déficitaire';
  return `Mois ${s}. ${stats.depenseMois}€ dépensés sur ${stats.revenuMois}€ de revenus.`;
}

// ---------------------------------------------------------------------
// MINDMAP / BRAINSTORM — agent autonome sur un projet
// ---------------------------------------------------------------------
const MINDMAP_SYSTEM = `Tu es CORE IA. Tu es chargé de brainstormer de manière structurée sur un projet personnel.
Tu reçois le nom, la description et les tâches existantes d'un projet. Tu dois produire une carte mentale autonome et riche : identifier les axes clés, sous-idées, risques, opportunités, ressources nécessaires.

Réponds STRICTEMENT en JSON :
{
  "racine": "nom court du projet (<= 60 car)",
  "resume": "phrase de synthèse (1-2 lignes)",
  "branches": [
    {
      "titre": "axe majeur (<= 40 car)",
      "categorie": "objectif"|"etape"|"risque"|"ressource"|"idee"|"opportunite",
      "enfants": [
        { "titre": "sous-idée concrète (<= 60 car)", "note": "détail court optionnel" }
      ]
    }
  ]
}

Règles :
- 4 à 7 branches principales, équilibrées entre objectifs, étapes, risques, opportunités, ressources.
- Chaque branche a 2 à 5 enfants concrets et actionnables.
- Phrases courtes, français, pas de blabla.
- Brainstorme largement : propose des angles auxquels l'utilisateur n'aurait pas pensé.
- N'invente pas de deadlines ou nombres précis.`;

export async function brainstormMindmap(project) {
  const payload = {
    nom: project.nom,
    description: project.description || '',
    statut: project.statut,
    priorite: project.priorite,
    taches: (project.tasks || []).map(t => ({ titre: t.titre, statut: t.statut })),
  };
  const content = await callGroq([
    { role: 'system', content: MINDMAP_SYSTEM },
    { role: 'user', content: JSON.stringify(payload) },
  ]);
  const parsed = safeJson(content);
  return normalizeMindmap(parsed, project);
}

function normalizeMindmap(raw, project) {
  const racine = String(raw?.racine || project.nom || 'Projet').slice(0, 80);
  const branches = Array.isArray(raw?.branches) ? raw.branches.slice(0, 8) : [];
  const CATS = ['objectif','etape','risque','ressource','idee','opportunite'];
  return {
    racine,
    resume: String(raw?.resume || '').slice(0, 300),
    branches: branches.map(b => ({
      titre: String(b?.titre || '').slice(0, 60),
      categorie: CATS.includes(b?.categorie) ? b.categorie : 'idee',
      enfants: Array.isArray(b?.enfants) ? b.enfants.slice(0, 6).map(c => ({
        titre: String(c?.titre || '').slice(0, 80),
        note: c?.note ? String(c.note).slice(0, 200) : null,
      })).filter(c => c.titre) : [],
    })).filter(b => b.titre),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------
// PROJECT STRUCTURATION FROM IDEA
// ---------------------------------------------------------------------
const PROJECT_SYSTEM = `Tu es CORE IA. À partir d'une idée brute, produis un projet structuré et exploitable.
Réponds STRICTEMENT en JSON :
{"nom":"nom court et clair (<= 80 car)","description":"objectif, contexte, critère de succès","priorite":0-5,"taches":["tâche 1","tâche 2","tâche 3","tâche 4","tâche 5"]}
"taches" = 3 à 6 sous-tâches atomiques (verbes d'action, ordre logique).`;

export async function structureProjectFromIdea(contenu) {
  const fallback = () => ({
    nom: (contenu || '').split('\n')[0].slice(0, 80) || "Projet issu d'une idée",
    description: contenu || '',
    priorite: 3,
    taches: [],
  });
  try {
    const content = await callGroq([
      { role: 'system', content: PROJECT_SYSTEM },
      { role: 'user', content: contenu },
    ]);
    const p = safeJson(content);
    return {
      nom: String(p.nom || '').slice(0, 80) || fallback().nom,
      description: String(p.description || contenu || ''),
      priorite: clampInt(p.priorite, 0, 5, 3),
      taches: Array.isArray(p.taches) ? p.taches.map(t => String(t)).slice(0, 10) : [],
    };
  } catch {
    return fallback();
  }
}

function clampInt(v, lo, hi, fallback) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------
// SUGGESTIONS PLANNER
// ---------------------------------------------------------------------
const ALLOWED_SUGGESTION_TYPES = [
  'creer_projet','creer_tache','idee_a_convertir','projet_stagnant','archiver_projet',
  'categoriser_finance','marquer_depense_fixe','finance_anomalie','optim_finance','optim_productivite',
];

const PLANNER_SYSTEM = `Tu es CORE IA, agent autonome de gestion personnelle (finances, projets, idées, tâches).
Tu reçois l'état complet en JSON et tu dois proposer entre 0 et 8 actions concrètes à valider par l'utilisateur.

Types d'actions permis (utilise UNIQUEMENT ceux-là) :
- "creer_projet" payload: {"nom":"...","description":"...","priorite":0-5}
- "creer_tache" payload: {"projectId":string,"titre":"...","priorite":0-5}
- "idee_a_convertir" payload: {"ideaId":string}
- "projet_stagnant" payload: {"projectId":string}
- "archiver_projet" payload: {"projectId":string}
- "categoriser_finance" payload: {"financeId":string,"categorie":"..."}
- "marquer_depense_fixe" payload: {"libelle":"...","montant":number,"categorie":"...","jour_mois":number|null}
- "finance_anomalie" payload: {"categorie":"...","max":number,"median":number}
- "optim_finance" payload: {"score":number}
- "optim_productivite" payload: {"score":number}

Règles strictes :
- Référence UNIQUEMENT des IDs présents dans le contexte.
- Chaque suggestion doit avoir "type", "description" (phrase courte impérative), "payload" conforme.
- Priorise : idées qui dorment, projets stagnants (+7j en todo), anomalies financières, scores bas, finances sans catégorie, dépenses récurrentes non marquées comme charges fixes.
- Évite les doublons avec "suggestions_ouvertes" déjà présentes.
- Si rien n'est pertinent : retourne {"suggestions":[]}.

Réponds STRICTEMENT en JSON : {"suggestions":[{"type":"","description":"","payload":{}}]}`;

export async function planSuggestions(context) {
  try {
    const content = await callGroq([
      { role: 'system', content: PLANNER_SYSTEM },
      { role: 'user', content: JSON.stringify(context) },
    ]);
    const parsed = safeJson(content);
    return sanitizeSuggestions(parsed.suggestions);
  } catch {
    return null;
  }
}

function sanitizeSuggestions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(s => s && typeof s === 'object' && ALLOWED_SUGGESTION_TYPES.includes(s.type))
    .map(s => ({
      type: s.type,
      description: String(s.description || '').slice(0, 240),
      payload: (s.payload && typeof s.payload === 'object') ? s.payload : {},
    }))
    .slice(0, 8);
}
