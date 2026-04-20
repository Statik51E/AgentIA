import { getIdToken } from './auth.jsx';

const BASE = import.meta.env.VITE_API_URL || '/api';

async function authHeaders() {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req(path, opts = {}) {
  const auth = await authHeaders();
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...auth },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

export const api = {
  finances: {
    list: (filters = {}) => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();
      return req(`/finances${q ? `?${q}` : ''}`);
    },
    summary: () => req('/finances/summary'),
    add: (data) => req('/finances', { method: 'POST', body: data }),
    patch: (id, data) => req(`/finances/${id}`, { method: 'PATCH', body: data }),
    del: (id) => req(`/finances/${id}`, { method: 'DELETE' }),
    exportCsv: async () => {
      const auth = await authHeaders();
      const r = await fetch(`${BASE}/finances/export.csv`, { headers: auth });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    },
    listFixed: () => req('/finances/fixed'),
    addFixed: (data) => req('/finances/fixed', { method: 'POST', body: data }),
    patchFixed: (id, data) => req(`/finances/fixed/${id}`, { method: 'PATCH', body: data }),
    delFixed: (id) => req(`/finances/fixed/${id}`, { method: 'DELETE' }),
    stats: (month) => req(`/finances/stats${month ? `?month=${month}` : ''}`),
    history: (months = 12) => req(`/finances/history?months=${months}`),
    listBudgets: () => req('/finances/budgets'),
    addBudget: (data) => req('/finances/budgets', { method: 'POST', body: data }),
    patchBudget: (id, data) => req(`/finances/budgets/${id}`, { method: 'PATCH', body: data }),
    delBudget: (id) => req(`/finances/budgets/${id}`, { method: 'DELETE' }),
    listAccounts: () => req('/finances/accounts'),
    addAccount: (data) => req('/finances/accounts', { method: 'POST', body: data }),
    patchAccount: (id, data) => req(`/finances/accounts/${id}`, { method: 'PATCH', body: data }),
    delAccount: (id) => req(`/finances/accounts/${id}`, { method: 'DELETE' }),
    transfer: (data) => req('/finances/accounts/transfer', { method: 'POST', body: data }),
    listGoals: () => req('/finances/goals'),
    addGoal: (data) => req('/finances/goals', { method: 'POST', body: data }),
    patchGoal: (id, data) => req(`/finances/goals/${id}`, { method: 'PATCH', body: data }),
    contributeGoal: (id, montant) => req(`/finances/goals/${id}/contribute`, { method: 'POST', body: { montant } }),
    delGoal: (id) => req(`/finances/goals/${id}`, { method: 'DELETE' }),
    analyzeStatement: (texte) => req('/finances/statement/analyze', { method: 'POST', body: { texte } }),
    analyzeStatementPDF: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const auth = await authHeaders();
      const r = await fetch(`${BASE}/finances/statement/pdf`, { method: 'POST', body: fd, headers: auth });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { const j = await r.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    importStatement: (data) => req('/finances/statement/import', { method: 'POST', body: data }),
  },
  projects: {
    list: () => req('/projects'),
    add: (data) => req('/projects', { method: 'POST', body: data }),
    patch: (id, data) => req(`/projects/${id}`, { method: 'PATCH', body: data }),
    del: (id) => req(`/projects/${id}`, { method: 'DELETE' }),
    addTask: (pid, data) => req(`/projects/${pid}/tasks`, { method: 'POST', body: data }),
    patchTask: (pid, tid, data) => req(`/projects/${pid}/tasks/${tid}`, { method: 'PATCH', body: data }),
    delTask: (pid, tid) => req(`/projects/${pid}/tasks/${tid}`, { method: 'DELETE' }),
  },
  ideas: {
    list: () => req('/ideas'),
    add: (data) => req('/ideas', { method: 'POST', body: data }),
    del: (id) => req(`/ideas/${id}`, { method: 'DELETE' }),
    convert: (id) => req(`/ideas/${id}/convert`, { method: 'POST' }),
  },
  ai: {
    analyze: (entree) => req('/ai/analyze', { method: 'POST', body: { entree } }),
    logs: () => req('/ai/logs'),
    daily: () => req('/ai/daily'),
    advice: () => req('/ai/advice'),
  },
  suggestions: {
    list: () => req('/suggestions'),
    run: () => req('/suggestions/run', { method: 'POST' }),
  },
  actions: {
    list: () => req('/actions'),
    validate: (id) => req(`/actions/${id}/validate`, { method: 'POST' }),
    reject: (id) => req(`/actions/${id}/reject`, { method: 'POST' }),
  },
};
