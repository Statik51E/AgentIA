/**
 * API shim — surface identique à l'ancien backend HTTP, mais 100% client-side
 * (Firestore pour la data, Groq direct pour l'IA). Permet de ne pas toucher
 * la majorité des pages existantes.
 */

import * as data from './dataService.js';
import * as ai from './aiClient.js';
import * as agent from './agent.js';
import { monthlyStats, monthlyHistory, dailyScores } from './statsClient.js';

export const api = {
  finances: {
    list: (filters = {}) => data.listFinances(filters),
    summary: () => data.financesSummary(),
    add: (d) => data.addFinance(d),
    patch: (id, d) => data.patchFinance(id, d),
    del: (id) => data.delFinance(id),
    exportCsv: async () => {
      const rows = await data.listFinances({ limit: 2000 });
      const accounts = await data.listAccounts();
      const accMap = Object.fromEntries(accounts.map(a => [a.id, a.nom]));
      const head = 'date,type,montant,categorie,note,compte\n';
      const body = rows.map(r => [
        r.date, r.type, r.montant,
        csvCell(r.categorie), csvCell(r.note),
        csvCell(r.account_id ? accMap[r.account_id] : ''),
      ].join(',')).join('\n');
      return new Blob([head + body], { type: 'text/csv;charset=utf-8' });
    },

    listFixed: () => data.listFixed(),
    addFixed: (d) => data.addFixed(d),
    patchFixed: (id, d) => data.patchFixed(id, d),
    delFixed: (id) => data.delFixed(id),

    stats: (month) => monthlyStats(month || null),
    history: (months = 12) => monthlyHistory(months),

    listBudgets: () => data.listBudgets(),
    addBudget: (d) => data.addBudget(d),
    patchBudget: (id, d) => data.patchBudget(id, d),
    delBudget: (id) => data.delBudget(id),

    listAccounts: () => data.listAccounts(),
    addAccount: (d) => data.addAccount(d),
    patchAccount: (id, d) => data.patchAccount(id, d),
    delAccount: (id) => data.delAccount(id),
    transfer: (d) => data.transferBetweenAccounts(d),

    listGoals: () => data.listGoals(),
    addGoal: (d) => data.addGoal(d),
    patchGoal: (id, d) => data.patchGoal(id, d),
    contributeGoal: (id, montant) => data.contributeGoal(id, montant),
    delGoal: (id) => data.delGoal(id),

    analyzeStatement: (texte) => ai.analyzeStatement(texte),
    analyzeStatementPDF: async (file) => {
      const texte = await extractPdfText(file);
      if (!texte || texte.length < 20) throw new Error('PDF vide ou illisible');
      const res = await ai.analyzeStatement(texte);
      return { ...res, texte_extrait_apercu: texte.slice(0, 400) };
    },
    importStatement: (d) => data.importStatement(d),
  },

  projects: {
    list: () => data.listProjects(),
    add: (d) => data.addProject(d),
    intakeQuestions: ({ nom, description }) => ai.generateProjectIntake({ nom, description }),
    buildIntakeDescription: (d) => ai.buildEnrichedProjectDescription(d),
    patch: (id, d) => data.patchProject(id, d),
    del: (id) => data.delProject(id),
    addTask: (pid, d) => data.addTask(pid, d),
    patchTask: (pid, tid, d) => data.patchTask(pid, tid, d),
    delTask: (pid, tid) => data.delTask(pid, tid),
    brainstorm: async (projectId) => {
      const projects = await data.listProjects();
      const p = projects.find(x => x.id === projectId);
      if (!p) throw new Error('projet introuvable');
      const mindmap = await ai.brainstormMindmap(p);
      await data.patchProject(projectId, { mindmap });
      return mindmap;
    },
  },

  ideas: {
    list: () => data.listIdeas(),
    add: async ({ contenu }) => {
      let structure = null, tags = [];
      try { const r = await ai.structureIdea(contenu); structure = r.structure; tags = r.tags; }
      catch { tags = contenu ? [] : []; }
      return data.addIdea({ contenu, structure, tags });
    },
    del: (id) => data.delIdea(id),
    convert: (id) => data.convertIdea(id),
  },

  ai: {
    analyze: async (entree) => {
      const type = ai.detectEntryType(entree);
      const result = await ai.analyzeEntry(entree, type);
      try { await data.addAiLog({ type, contenu: { entree, result } }); } catch {}
      return { type, ...result };
    },
    logs: () => data.listAiLogs(),
    daily: () => dailyScores(),
    advice: async () => {
      const stats = await monthlyStats();
      const advice = await ai.generateFinanceAdvice(stats);
      return { stats, ...advice };
    },
    overdraftPlan: async () => {
      const [stats, summary, history] = await Promise.all([
        monthlyStats(),
        data.financesSummary(),
        monthlyHistory(6),
      ]);
      const plan = await ai.generateOverdraftPlan({ stats, summary, history });
      return { stats, summary, history, ...plan };
    },
    organizeIdeas: async () => {
      const ideas = await data.listIdeas();
      const res = await ai.organizeIdeas(ideas);
      return { ...res, ideas };
    },
    chat: ({ system, messages }) => ai.chatWithExpert({ system, messages }),
    projectBrief: async (projectId) => {
      const projects = await data.listProjects();
      const p = projects.find(x => x.id === projectId);
      if (!p) throw new Error('projet introuvable');
      const brief = await ai.generateProjectBrief(p);
      await data.patchProject(projectId, { brief });
      return brief;
    },
  },

  suggestions: {
    list: () => data.listSuggestions(),
    run: async () => { const created = await agent.generateSuggestions(); return { created }; },
  },

  actions: {
    list: () => data.listActions(),
    validate: (id) => agent.validateAction(id),
    reject: (id) => agent.rejectAction(id),
  },

  settings: {
    get: () => data.getSettings(),
    save: (patch) => data.saveSettings(patch),
  },

  realtime: {
    subscribe: (names, onChange, opts) => data.subscribeCollections(names, onChange, opts),
  },

  context: {
    snapshot: (kind) => buildContextSnapshot(kind),
  },
};

async function buildContextSnapshot(kind = 'finance') {
  try {
    if (kind === 'finance') {
      const [stats, summary, fixed, accounts, goals, history] = await Promise.all([
        monthlyStats(),
        data.financesSummary(),
        data.listFixed(),
        data.listAccounts(),
        data.listGoals(),
        monthlyHistory(3),
      ]);
      return {
        kind: 'finance',
        mois: stats.mois,
        jour: `${stats.jour}/${stats.joursDansMois}`,
        revenuMois: stats.revenuMois,
        depenseMois: stats.depenseMois,
        projectionMois: stats.projectionMois,
        chargesFixes: stats.chargesFixes,
        budgetDisponible: stats.budgetDisponible,
        soldeGlobal: summary.solde,
        soldeApresChargesFixes: summary.solde_apres_charges,
        depassements: stats.depassements,
        alertes: stats.alertes,
        anomalies: summary.anomalies,
        top_categories: (stats.totauxParCategorie || []).slice(0, 8),
        charges_fixes: fixed.filter(f => f.actif !== false).slice(0, 30).map(f => ({
          libelle: f.libelle, montant: f.montant, categorie: f.categorie, jour_mois: f.jour_mois,
        })),
        comptes: accounts.slice(0, 10).map(a => ({ nom: a.nom, type: a.type, solde: a.solde })),
        objectifs: goals.slice(0, 10).map(g => ({ nom: g.nom, cible: g.cible, actuel: g.actuel, deadline: g.deadline })),
        historique_3_mois: history,
      };
    }
    if (kind === 'project') {
      const [projects, ideas] = await Promise.all([data.listProjects(), data.listIdeas()]);
      return {
        kind: 'project',
        projets: projects.slice(0, 30).map(p => ({
          id: p.id, nom: p.nom, statut: p.statut, priorite: p.priorite,
          description: (p.description || '').slice(0, 200),
          taches: (p.tasks || []).slice(0, 20).map(t => ({ titre: t.titre, statut: t.statut })),
          mindmap_resume: p.mindmap?.resume || null,
          has_brief: Boolean(p.brief?.markdown),
        })),
        idees_count: ideas.length,
        idees_recentes: ideas.slice(0, 10).map(i => ({
          contenu: (i.contenu || '').slice(0, 160), tags: i.tags || [],
        })),
      };
    }
    return { kind };
  } catch (e) {
    return { kind, error: e.message };
  }
}

function csvCell(s) {
  if (s == null) return '';
  const v = String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function extractPdfText(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text.trim();
}
