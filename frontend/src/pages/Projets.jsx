import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';

const STATUTS = [
  { k: 'todo', label: 'À faire' },
  { k: 'en_cours', label: 'En cours' },
  { k: 'termine', label: 'Terminé' },
];

export default function Projets() {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ nom: '', description: '' });
  const [taskDrafts, setTaskDrafts] = useState({});

  const load = async () => setProjects(await api.projects.list());
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    await api.projects.add(form);
    setForm({ nom: '', description: '' });
    load();
  };
  const delProject = async (id) => { await api.projects.del(id); load(); };
  const cycleStatus = async (p) => {
    const idx = STATUTS.findIndex(s => s.k === p.statut);
    const next = STATUTS[(idx + 1) % STATUTS.length].k;
    await api.projects.patch(p.id, { statut: next }); load();
  };
  const addTask = async (pid) => {
    const titre = (taskDrafts[pid] || '').trim();
    if (!titre) return;
    await api.projects.addTask(pid, { titre });
    setTaskDrafts({ ...taskDrafts, [pid]: '' }); load();
  };
  const toggleTask = async (pid, t) => {
    const order = ['todo', 'en_cours', 'termine'];
    const next = order[(order.indexOf(t.statut) + 1) % order.length];
    await api.projects.patchTask(pid, t.id, { statut: next }); load();
  };
  const delTask = async (pid, tid) => { await api.projects.delTask(pid, tid); load(); };

  return (
    <>
      <TopBar title="Projets" sub="Priorisation automatique & tâches" />

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Nouveau projet</h3>
        <form className="form" onSubmit={add} style={{ marginTop: 10 }}>
          <input className="input" placeholder="Nom du projet" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
          <textarea className="textarea" placeholder="Description (optionnel — aide la priorisation IA)"
                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <button className="btn" type="submit">Créer</button>
        </form>
      </div>

      {projects.length === 0 && <div className="empty">Aucun projet. Crée le premier.</div>}

      <div className="list">
        {projects.map(p => (
          <div key={p.id} className="card fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${p.statut === 'termine' ? 'ok' : p.statut === 'en_cours' ? 'acc' : 'warn'}`}>
                    {STATUTS.find(s => s.k === p.statut)?.label}
                  </span>
                  <span className="badge">prio {p.priorite}</span>
                  <strong style={{ fontSize: 16 }}>{p.nom}</strong>
                </div>
                {p.description && <div className="meta" style={{ marginTop: 6 }}>{p.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost small" onClick={() => cycleStatus(p)}>→ statut</button>
                <button className="btn ghost small" onClick={() => delProject(p.id)}>Suppr.</button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="list">
                {(p.tasks || []).map(t => (
                  <div key={t.id} className="row">
                    <div>
                      <span className={`badge ${t.statut === 'termine' ? 'ok' : t.statut === 'en_cours' ? 'acc' : ''}`}>{t.statut}</span>{' '}
                      <span className="title">{t.titre}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn ghost small" onClick={() => toggleTask(p.id, t)}>→</button>
                      <button className="btn ghost small" onClick={() => delTask(p.id, t.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="input"
                  placeholder="Nouvelle tâche…"
                  value={taskDrafts[p.id] || ''}
                  onChange={e => setTaskDrafts({ ...taskDrafts, [p.id]: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(p.id); } }}
                />
                <button className="btn small" onClick={() => addTask(p.id)}>Ajouter</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
