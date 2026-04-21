import { getSettings } from './dataService.js';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Round-robin cursor + per-key cooldown (rate-limit / auth fail recovery)
const keyState = new Map(); // key -> { cooldownUntil: epoch_ms }
let rrCursor = 0;

function collectKeys(s) {
  const raw = [];
  if (Array.isArray(s?.groqApiKeys)) raw.push(...s.groqApiKeys);
  if (typeof s?.groqApiKey === 'string') raw.push(s.groqApiKey);
  const seen = new Set();
  const keys = [];
  for (const k of raw) {
    const v = typeof k === 'string' ? k.trim() : '';
    if (v && !seen.has(v)) { seen.add(v); keys.push(v); }
  }
  return keys;
}

async function groqContext() {
  const s = await getSettings();
  const keys = collectKeys(s);
  if (keys.length === 0) throw new Error('Ajoute au moins une clé API Groq dans les Paramètres pour utiliser l\'IA.');
  return { keys, model: s?.groqModel || DEFAULT_MODEL };
}

function pickAvailable(keys) {
  const now = Date.now();
  const live = keys.filter(k => !(keyState.get(k)?.cooldownUntil > now));
  const pool = live.length ? live : keys; // if all in cooldown, retry anyway
  const start = rrCursor % pool.length;
  rrCursor = (start + 1) % pool.length;
  // Order: start → end → wrap
  return [...pool.slice(start), ...pool.slice(0, start)];
}

function markCooldown(key, ms) {
  keyState.set(key, { cooldownUntil: Date.now() + ms });
}

async function callGroq(messages, { json = true } = {}) {
  const { keys, model } = await groqContext();
  const order = pickAvailable(keys);
  let lastErr = null;

  for (const key of order) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        return data.choices?.[0]?.message?.content || '';
      }
      const txt = await r.text();
      // 429 / 5xx → rate limit or transient, try next key; 401/403 → bad key, quarantine
      if (r.status === 429)              markCooldown(key, 60_000);
      else if (r.status >= 500)          markCooldown(key, 15_000);
      else if (r.status === 401 || r.status === 403) markCooldown(key, 10 * 60_000);
      lastErr = new Error(`Groq ${r.status}: ${txt.slice(0, 200)}`);
      // 400-level (other than auth/429) → bail, pas la peine d'essayer les autres
      if (r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 401 && r.status !== 403) {
        throw lastErr;
      }
    } catch (e) {
      lastErr = e;
      markCooldown(key, 30_000);
    }
  }
  throw lastErr || new Error('Aucune clé Groq disponible.');
}

export async function testGroqKey(key, model = DEFAULT_MODEL) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 2,
    }),
  });
  if (r.ok) return { ok: true };
  const txt = await r.text();
  return { ok: false, status: r.status, message: txt.slice(0, 160) };
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
// OVERDRAFT RECOVERY PLAN — solde négatif → plan d'action
// ---------------------------------------------------------------------
const OVERDRAFT_SYSTEM = `Tu es CORE IA, conseiller financier personnel très concret.
L'utilisateur est en découvert ou risque d'y être. Tu reçois son état financier détaillé (revenus, dépenses par catégorie, charges fixes, anomalies, historique).
Tu dois produire un plan de redressement solide, réaliste, étape par étape, ordonné du plus urgent au plus structurel.

Réponds STRICTEMENT en JSON :
{
  "diagnostic": "2-3 phrases : pourquoi le découvert, causes principales",
  "urgence": "critique"|"elevee"|"moderee",
  "economie_mensuelle_cible": number,
  "etapes": [
    {
      "ordre": 1,
      "titre": "action courte (<= 60 car)",
      "pourquoi": "impact attendu (1 phrase)",
      "economie_estimee": number,
      "delai": "immediat"|"1_semaine"|"1_mois"|"3_mois",
      "categorie": "dépense concernée ou 'global'",
      "effort": "faible"|"moyen"|"eleve"
    }
  ],
  "optimisations_long_terme": ["action structurelle 1", "action structurelle 2"],
  "risques": ["risque 1 à surveiller"]
}

Règles :
- 4 à 8 étapes, ordonnées logiquement.
- Vise des économies chiffrées réalistes basées SUR les données reçues (pas de deviner).
- Priorise : couper les abonnements inutiles, renégocier crédit/assurance/télécom, réduire les catégories en anomalie, étaler les gros paiements.
- Ne propose PAS de solutions magiques (prêt familial, crypto, gains hypothétiques).
- Français, ton direct, phrases courtes.`;

export async function generateOverdraftPlan(data) {
  try {
    const content = await callGroq([
      { role: 'system', content: OVERDRAFT_SYSTEM },
      { role: 'user', content: JSON.stringify(data).slice(0, 12_000) },
    ]);
    const parsed = safeJson(content);
    const URGENCES = ['critique', 'elevee', 'moderee'];
    const DELAIS = ['immediat', '1_semaine', '1_mois', '3_mois'];
    const EFFORTS = ['faible', 'moyen', 'eleve'];
    return {
      diagnostic: String(parsed.diagnostic || '').slice(0, 400),
      urgence: URGENCES.includes(parsed.urgence) ? parsed.urgence : 'moderee',
      economie_mensuelle_cible: Math.max(0, Number(parsed.economie_mensuelle_cible) || 0),
      etapes: Array.isArray(parsed.etapes) ? parsed.etapes.slice(0, 10).map((e, i) => ({
        ordre: Number.isInteger(e?.ordre) ? e.ordre : i + 1,
        titre: String(e?.titre || '').slice(0, 80),
        pourquoi: String(e?.pourquoi || '').slice(0, 240),
        economie_estimee: Math.max(0, Number(e?.economie_estimee) || 0),
        delai: DELAIS.includes(e?.delai) ? e.delai : '1_mois',
        categorie: String(e?.categorie || 'global').slice(0, 40),
        effort: EFFORTS.includes(e?.effort) ? e.effort : 'moyen',
      })).filter(e => e.titre) : [],
      optimisations_long_terme: Array.isArray(parsed.optimisations_long_terme)
        ? parsed.optimisations_long_terme.slice(0, 6).map(s => String(s).slice(0, 160)).filter(Boolean)
        : [],
      risques: Array.isArray(parsed.risques)
        ? parsed.risques.slice(0, 6).map(s => String(s).slice(0, 160)).filter(Boolean)
        : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { error: e.message, etapes: [], optimisations_long_terme: [], risques: [] };
  }
}

// ---------------------------------------------------------------------
// IDEA ORGANIZER — cluster / groupe / priorise
// ---------------------------------------------------------------------
const ORGANIZER_SYSTEM = `Tu es CORE IA, organisateur d'idées. Tu reçois une liste d'idées brutes (contenu + tags éventuels).
Tu dois les regrouper par thème, détecter les doublons, les prioriser et proposer celles à convertir en projet.

Réponds STRICTEMENT en JSON :
{
  "groupes": [
    {
      "theme": "nom du groupe (<= 50 car)",
      "description": "phrase courte expliquant le thème",
      "ideas_ids": ["id1", "id2"],
      "priorite": 0-5,
      "action_suggeree": "convertir en projet"|"fusionner"|"approfondir"|"archiver"|"garder"
    }
  ],
  "doublons": [
    { "ids": ["id1", "id2"], "raison": "pourquoi ce sont des doublons" }
  ],
  "a_convertir": [
    { "id": "id1", "raison": "pourquoi cette idée mérite de devenir un projet maintenant" }
  ],
  "resume": "phrase de synthèse globale"
}

Règles :
- Utilise UNIQUEMENT les IDs fournis.
- Chaque idée peut être dans 0 ou 1 groupe (pas plusieurs).
- Si < 3 idées, retourne 1 seul groupe avec "garder".
- Français, concis.`;

export async function organizeIdeas(ideas) {
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return { groupes: [], doublons: [], a_convertir: [], resume: 'Aucune idée à organiser.' };
  }
  const payload = ideas.slice(0, 60).map(i => ({
    id: i.id,
    contenu: String(i.contenu || '').slice(0, 400),
    tags: Array.isArray(i.tags) ? i.tags.slice(0, 8) : [],
  }));
  try {
    const content = await callGroq([
      { role: 'system', content: ORGANIZER_SYSTEM },
      { role: 'user', content: JSON.stringify(payload) },
    ]);
    const parsed = safeJson(content);
    const validIds = new Set(payload.map(p => p.id));
    const ACTIONS = ['convertir en projet', 'fusionner', 'approfondir', 'archiver', 'garder'];
    return {
      groupes: Array.isArray(parsed.groupes) ? parsed.groupes.slice(0, 12).map(g => ({
        theme: String(g?.theme || '').slice(0, 60),
        description: String(g?.description || '').slice(0, 240),
        ideas_ids: Array.isArray(g?.ideas_ids) ? g.ideas_ids.filter(id => validIds.has(id)) : [],
        priorite: clampInt(g?.priorite, 0, 5, 2),
        action_suggeree: ACTIONS.includes(g?.action_suggeree) ? g.action_suggeree : 'garder',
      })).filter(g => g.theme && g.ideas_ids.length > 0) : [],
      doublons: Array.isArray(parsed.doublons) ? parsed.doublons.slice(0, 10).map(d => ({
        ids: Array.isArray(d?.ids) ? d.ids.filter(id => validIds.has(id)) : [],
        raison: String(d?.raison || '').slice(0, 200),
      })).filter(d => d.ids.length >= 2) : [],
      a_convertir: Array.isArray(parsed.a_convertir) ? parsed.a_convertir.slice(0, 10).map(a => ({
        id: String(a?.id || ''),
        raison: String(a?.raison || '').slice(0, 240),
      })).filter(a => validIds.has(a.id)) : [],
      resume: String(parsed.resume || '').slice(0, 300),
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { error: e.message, groupes: [], doublons: [], a_convertir: [], resume: '' };
  }
}

// ---------------------------------------------------------------------
// PROJECT BRIEF — document markdown généré par l'IA pour un projet
// ---------------------------------------------------------------------
const BRIEF_SYSTEM = `Tu es CORE IA. Tu produis un brief projet complet au format markdown.
Le document doit contenir, dans cet ordre :
# <nom du projet>
## Contexte
## Objectifs (3-5 bullets mesurables)
## Livrables (liste concrète)
## Jalons (avec ordre logique, pas de dates inventées)
## Risques & dépendances
## Ressources nécessaires
## Critères de succès
## Prochaines actions immédiates (3-5)

Règles :
- Français, style direct, pas de remplissage.
- N'invente PAS de dates, budgets, ou personnes.
- Reste fidèle au nom, description et tâches fournis.
- Réponds UNIQUEMENT avec le markdown brut (pas de balises code, pas de JSON).`;

export async function generateProjectBrief(project) {
  const payload = {
    nom: project.nom,
    description: project.description || '',
    statut: project.statut,
    priorite: project.priorite,
    taches: (project.tasks || []).map(t => ({ titre: t.titre, statut: t.statut })),
  };
  const content = await callGroq([
    { role: 'system', content: BRIEF_SYSTEM },
    { role: 'user', content: JSON.stringify(payload) },
  ], { json: false });
  return {
    markdown: String(content || '').trim(),
    generatedAt: new Date().toISOString(),
  };
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
