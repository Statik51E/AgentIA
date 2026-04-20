/**
 * AI Provider — interface unique du CORE IA.
 * Moteurs interchangeables via .env (AI_PROVIDER):
 *   - "stub"   : heuristiques internes, 100% offline (par défaut).
 *   - "ollama" : appelle un LLM local (http://localhost:11434).
 *   - "groq"   : appelle l'API Groq (https://api.groq.com) — rapide, gratuit.
 *
 * Contrat de sortie : { analyse, structure, ameliorations, actions[] }
 */

const PROVIDER = (process.env.AI_PROVIDER || 'stub').toLowerCase();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM = `Tu es le CORE IA. Tu es direct, logique, orienté résultat, critique si nécessaire.
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
  if (PROVIDER === 'groq') {
    try { return await callGroq(entree, type); }
    catch (e) { console.warn('[AI] Groq KO, fallback stub:', e.message); }
  }
  if (PROVIDER === 'ollama') {
    try { return await callOllama(entree, type); }
    catch (e) { console.warn('[AI] Ollama KO, fallback stub:', e.message); }
  }
  return stubAnalyze(entree, type);
}

export async function structureIdea(contenu) {
  const out = await analyzeEntry(contenu, 'idee');
  return {
    structure: out.structure || contenu,
    tags: extractTags(contenu),
  };
}

// ---------------------------------------------------------------------
// STUB — règles + heuristiques (zéro dépendance réseau)
// ---------------------------------------------------------------------
function stubAnalyze(entree, type) {
  const lines = entree.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const first = lines[0] || entree.slice(0, 80);
  const base = {
    analyse: '',
    structure: '',
    ameliorations: '',
    actions: [],
  };

  switch (type) {
    case 'finance': {
      const montant = (entree.match(/(\d+[.,]?\d*)/) || [])[1];
      base.analyse = `Entrée financière détectée${montant ? ` (~${montant} €)` : ''}. Vérifier la catégorisation.`;
      base.structure = `- Type : revenu / dépense\n- Montant : ${montant || '?'}\n- Catégorie : à définir\n- Note : ${first}`;
      base.ameliorations = 'Assigner une catégorie, noter la récurrence, comparer au budget mensuel.';
      base.actions = ['Catégoriser la transaction', 'Vérifier la récurrence', 'Mettre à jour le budget'];
      break;
    }
    case 'projet': {
      base.analyse = `Projet identifié : "${first}". Découper en livrables clairs et priorisés.`;
      base.structure = lines.length > 1
        ? lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
        : `1. Objectif : ${first}\n2. Livrables : à lister\n3. Deadline : à définir\n4. Bloqueurs : à identifier`;
      base.ameliorations = 'Définir un critère de succès mesurable et la prochaine action concrète.';
      base.actions = ['Créer les sous-tâches', 'Fixer une deadline', 'Définir le critère de succès'];
      break;
    }
    case 'idee': {
      base.analyse = `Idée brute : "${first}". Challenger la valeur et la faisabilité.`;
      base.structure = `- Concept : ${first}\n- Problème résolu : ?\n- Cible : ?\n- MVP minimal : ?\n- Risques : ?`;
      base.ameliorations = 'Formuler en une phrase de valeur et définir la plus petite expérimentation possible.';
      base.actions = ['Formuler la proposition de valeur', 'Lister 3 risques', 'Convertir en projet si validée'];
      break;
    }
    case 'tache': {
      base.analyse = `Tâche à cadrer : "${first}".`;
      base.structure = `- Action : ${first}\n- Contexte : ?\n- Résultat attendu : ?\n- Durée estimée : ?`;
      base.ameliorations = 'Rendre l\'action atomique (verbe d\'action, < 2h).';
      base.actions = ['Clarifier le résultat attendu', 'Estimer la durée', 'Planifier un créneau'];
      break;
    }
    default: {
      base.analyse = `Entrée libre : "${first}". Manque de contexte pour qualifier.`;
      base.structure = lines.map((l, i) => `• ${l}`).join('\n') || `• ${first}`;
      base.ameliorations = 'Préciser l\'intention : finance, projet, idée ou tâche ?';
      base.actions = ['Qualifier le type d\'entrée', 'Reformuler en une phrase', 'Associer à un projet existant'];
    }
  }

  return base;
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
// OLLAMA — hook prêt (aucune clé requise, 100% local)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// GROQ — API cloud ultra-rapide (OpenAI-compatible)
// ---------------------------------------------------------------------
async function callGroq(entree, type) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Type détecté : ${type}\nEntrée utilisateur :\n${entree}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  return {
    analyse: String(parsed.analyse || ''),
    structure: String(parsed.structure || ''),
    ameliorations: String(parsed.ameliorations || ''),
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
  };
}

async function callOllama(entree, type) {
  const prompt = `${SYSTEM}\n\nType détecté : ${type}\nEntrée utilisateur :\n${entree}\n\nRéponse JSON :`;
  const r = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json' }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const data = await r.json();
  const parsed = JSON.parse(data.response);
  return {
    analyse: String(parsed.analyse || ''),
    structure: String(parsed.structure || ''),
    ameliorations: String(parsed.ameliorations || ''),
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
  };
}

// ---------------------------------------------------------------------
// AGENT AUTONOME — planifie des suggestions à partir du contexte complet
// ---------------------------------------------------------------------
const ALLOWED_SUGGESTION_TYPES = [
  'creer_projet',
  'creer_tache',
  'idee_a_convertir',
  'projet_stagnant',
  'archiver_projet',
  'categoriser_finance',
  'marquer_depense_fixe',
  'finance_anomalie',
  'optim_finance',
  'optim_productivite',
];

const PLANNER_SYSTEM = `Tu es CORE IA, agent autonome de gestion personnelle (finances, projets, idées, tâches).
Tu reçois l'état complet en JSON et tu dois proposer entre 0 et 8 actions concrètes à valider par l'utilisateur.

Types d'actions permis (utilise UNIQUEMENT ceux-là) :
- "creer_projet"        payload: {"nom": "...", "description": "...", "priorite": 0-5}
- "creer_tache"         payload: {"projectId": number, "titre": "...", "priorite": 0-5}
- "idee_a_convertir"    payload: {"ideaId": number}
- "projet_stagnant"     payload: {"projectId": number}
- "archiver_projet"     payload: {"projectId": number}
- "categoriser_finance" payload: {"financeId": number, "categorie": "..."}
- "marquer_depense_fixe" payload: {"libelle": "...", "montant": number, "categorie": "...", "jour_mois": number|null}
- "finance_anomalie"    payload: {"categorie": "...", "max": number, "median": number}
- "optim_finance"       payload: {"score": number}
- "optim_productivite"  payload: {"score": number}

Règles strictes :
- Référence UNIQUEMENT des IDs présents dans le contexte (projets, idées, finances).
- Chaque suggestion doit avoir "type", "description" (phrase courte, impérative, en français), "payload" conforme.
- Priorise : idées qui dorment, projets stagnants (+7j en todo), anomalies financières, scores bas, finances sans catégorie, dépenses récurrentes non marquées comme charges fixes.
- Détecte les charges fixes : si une dépense revient plusieurs fois avec même libellé/montant et n'est pas dans "charges_fixes", propose "marquer_depense_fixe".
- Évite les doublons avec "suggestions_ouvertes" et "charges_fixes" déjà présentes dans le contexte.
- Si rien n'est pertinent ou données insuffisantes : retourne {"suggestions": []}.

Réponds STRICTEMENT en JSON : {"suggestions": [{"type":"","description":"","payload":{}}]}`;

export async function planSuggestions(context) {
  if (PROVIDER === 'stub') return null;
  try {
    if (PROVIDER === 'groq') {
      if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: PLANNER_SYSTEM },
            { role: 'user', content: JSON.stringify(context) },
          ],
        }),
      });
      if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return sanitizeSuggestions(parsed.suggestions);
    }
    if (PROVIDER === 'ollama') {
      const r = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `${PLANNER_SYSTEM}\n\nContexte :\n${JSON.stringify(context)}\n\nRéponse JSON :`,
          stream: false,
          format: 'json',
        }),
      });
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      const data = await r.json();
      const parsed = JSON.parse(data.response);
      return sanitizeSuggestions(parsed.suggestions);
    }
  } catch (e) {
    console.warn('[AI] planSuggestions KO, fallback règles:', e.message);
    return null;
  }
  return null;
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

// ---------------------------------------------------------------------
// STRUCTURATION PROJET (idée → projet riche avec sous-tâches)
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
  if (PROVIDER === 'stub') return fallback();
  try {
    if (PROVIDER === 'groq') {
      if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: PROJECT_SYSTEM },
            { role: 'user', content: contenu },
          ],
        }),
      });
      if (!r.ok) throw new Error(`Groq ${r.status}`);
      const data = await r.json();
      const p = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return {
        nom: String(p.nom || '').slice(0, 80) || fallback().nom,
        description: String(p.description || contenu || ''),
        priorite: clampInt(p.priorite, 0, 5, 3),
        taches: Array.isArray(p.taches) ? p.taches.map(t => String(t)).slice(0, 10) : [],
      };
    }
    if (PROVIDER === 'ollama') {
      const r = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `${PROJECT_SYSTEM}\n\nIdée :\n${contenu}\n\nRéponse JSON :`,
          stream: false,
          format: 'json',
        }),
      });
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      const data = await r.json();
      const p = JSON.parse(data.response);
      return {
        nom: String(p.nom || '').slice(0, 80) || fallback().nom,
        description: String(p.description || contenu || ''),
        priorite: clampInt(p.priorite, 0, 5, 3),
        taches: Array.isArray(p.taches) ? p.taches.map(t => String(t)).slice(0, 10) : [],
      };
    }
  } catch (e) {
    console.warn('[AI] structureProjectFromIdea KO, fallback:', e.message);
  }
  return fallback();
}

function clampInt(v, lo, hi, fallback) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------
// RELEVÉ DE COMPTE — extraction de transactions + détection charges fixes
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
- "depenses_fixes" = opérations qui reviennent chaque mois (fréquence mensuelle quasi-constante).
- Ne devine pas : si un champ manque dans le relevé, mets null ou ignore la ligne.
- Retourne tous les transactions (jusqu'à 100 max).`;

export async function analyzeStatement(texte) {
  if (!texte || typeof texte !== 'string') throw new Error('texte du relevé requis');
  if (PROVIDER === 'groq') {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: STATEMENT_SYSTEM },
          { role: 'user', content: texte.slice(0, 30_000) },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return normalizeStatement(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
  }
  if (PROVIDER === 'ollama') {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `${STATEMENT_SYSTEM}\n\nRelevé :\n${texte.slice(0, 30_000)}\n\nRéponse JSON :`,
        stream: false,
        format: 'json',
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    const data = await r.json();
    return normalizeStatement(JSON.parse(data.response));
  }
  throw new Error('Analyse de relevé indisponible avec AI_PROVIDER=stub');
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
// CONSEILS IA EN TEMPS RÉEL — coach financier personnel
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
- Si tout va bien : félicite sobrement et propose une optimisation (épargne, réserve, investissement).
- "categorie" = la catégorie concernée (loyer, loisir, restaurant, etc.) ou "global".`;

export async function generateFinanceAdvice(stats) {
  const fallback = () => ({ conseils: fallbackAdvice(stats), verdict: fallbackVerdict(stats) });
  if (PROVIDER === 'stub') return fallback();
  try {
    if (PROVIDER === 'groq') {
      if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY manquant');
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: ADVICE_SYSTEM },
            { role: 'user', content: JSON.stringify(stats) },
          ],
        }),
      });
      if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return {
        conseils: Array.isArray(parsed.conseils) ? parsed.conseils.slice(0, 8).map(c => ({
          priorite: ['haute','moyenne','basse'].includes(c?.priorite) ? c.priorite : 'moyenne',
          titre: String(c?.titre || '').slice(0, 120),
          message: String(c?.message || '').slice(0, 400),
          categorie: String(c?.categorie || 'global').slice(0, 40),
        })) : [],
        verdict: String(parsed.verdict || '').slice(0, 300),
      };
    }
    if (PROVIDER === 'ollama') {
      const r = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `${ADVICE_SYSTEM}\n\nStats :\n${JSON.stringify(stats)}\n\nRéponse JSON :`,
          stream: false,
          format: 'json',
        }),
      });
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      const data = await r.json();
      const parsed = JSON.parse(data.response);
      return {
        conseils: Array.isArray(parsed.conseils) ? parsed.conseils.slice(0, 8) : [],
        verdict: String(parsed.verdict || ''),
      };
    }
  } catch (e) {
    console.warn('[AI] generateFinanceAdvice KO, fallback:', e.message);
  }
  return fallback();
}

function fallbackAdvice(stats) {
  const out = [];
  for (const d of (stats?.depassements || [])) {
    out.push({
      priorite: 'haute',
      titre: `Budget ${d.categorie} dépassé`,
      message: `Tu as dépensé ${d.depense}€ pour une limite de ${d.limite}€ (+${d.depasse}€).`,
      categorie: d.categorie,
    });
  }
  for (const a of (stats?.alertes || [])) {
    out.push({
      priorite: 'moyenne',
      titre: `Budget ${a.categorie} à ${a.pourcentage}%`,
      message: `Il te reste ${a.reste}€ pour le mois.`,
      categorie: a.categorie,
    });
  }
  if (stats?.projectionMois > stats?.revenuMois && stats?.revenuMois > 0) {
    out.push({
      priorite: 'haute',
      titre: 'Projection au-dessus du revenu',
      message: `Au rythme actuel tu dépenseras ${stats.projectionMois}€ ce mois pour ${stats.revenuMois}€ de revenus.`,
      categorie: 'global',
    });
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
