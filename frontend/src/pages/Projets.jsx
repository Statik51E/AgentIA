import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import MindMap from '../components/MindMap.jsx';
import ChatWidget from '../components/ChatWidget.jsx';

const STATUTS = [
  { k: 'todo', label: 'À faire' },
  { k: 'en_cours', label: 'En cours' },
  { k: 'termine', label: 'Terminé' },
];

export default function Projets() {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ nom: '', description: '' });
  const [taskDrafts, setTaskDrafts] = useState({});
  const [openMap, setOpenMap] = useState(null); // project id
  const [openBrief, setOpenBrief] = useState(null); // project id
  const [brainstorming, setBrainstorming] = useState(null); // project id
  const [briefing, setBriefing] = useState(null); // project id
  const [bulkRunning, setBulkRunning] = useState(false);
  const [err, setErr] = useState('');
  const [intake, setIntake] = useState(null); // { nom, description, questions, answers, loading }

  const load = async () => { try { setProjects(await api.projects.list()); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const unsub = api.realtime.subscribe(['projects', 'ideas'], () => { load(); });
    return () => { try { unsub?.(); } catch {} };
  }, []);

  const openIntake = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setErr('');
    setIntake({ nom: form.nom.trim(), description: form.description, questions: [], answers: {}, loading: true });
    try {
      const questions = await api.projects.intakeQuestions({ nom: form.nom.trim(), description: form.description });
      setIntake(prev => prev ? { ...prev, questions, loading: false } : prev);
    } catch (ex) {
      setErr(ex.message);
      setIntake(prev => prev ? { ...prev, loading: false } : prev);
    }
  };

  const finishIntake = async ({ skip = false } = {}) => {
    if (!intake) return;
    const enrichedDescription = skip
      ? intake.description
      : api.projects.buildIntakeDescription({
          description: intake.description,
          questions: intake.questions,
          answers: intake.answers,
        });
    const intakePayload = skip ? null : {
      questions: intake.questions,
      answers: intake.answers,
      generatedAt: new Date().toISOString(),
    };
    try {
      await api.projects.add({
        nom: intake.nom,
        description: enrichedDescription || null,
        intake: intakePayload,
      });
      setForm({ nom: '', description: '' });
      setIntake(null);
      load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const updateAnswer = (qid, value) => {
    setIntake(prev => prev ? { ...prev, answers: { ...prev.answers, [qid]: value } } : prev);
  };
  const delProject = async (id) => { await api.projects.del(id); if (openMap === id) setOpenMap(null); load(); };
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

  const brainstorm = async (pid) => {
    setBrainstorming(pid); setErr('');
    try {
      await api.projects.brainstorm(pid);
      await load();
      setOpenMap(pid);
    } catch (e) { setErr(e.message); }
    finally { setBrainstorming(null); }
  };

  const generateBrief = async (pid) => {
    setBriefing(pid); setErr('');
    try {
      await api.ai.projectBrief(pid);
      await load();
      setOpenBrief(pid);
    } catch (e) { setErr(e.message); }
    finally { setBriefing(null); }
  };

  const downloadBrief = (p) => {
    const md = p.brief?.markdown;
    if (!md) return;
    const slug = (p.nom || 'projet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet';
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${slug}.md`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  };

  const brainstormAll = async () => {
    const candidates = projects.filter(p => p.statut !== 'termine' && !p.mindmap);
    if (!candidates.length) { setErr('Aucun projet sans carte mentale.'); return; }
    setBulkRunning(true); setErr('');
    try {
      for (const p of candidates) {
        try { await api.projects.brainstorm(p.id); } catch (e) { console.warn('[brainstorm]', p.nom, e.message); }
      }
      await load();
    } finally { setBulkRunning(false); }
  };

  return (
    <>
      <TopBar
        title="Projets"
        sub="Priorisation auto · tâches · cartes mentales IA"
        right={
          <button className="btn ghost small" onClick={brainstormAll} disabled={bulkRunning}>
            {bulkRunning ? 'IA brainstorm…' : '🧠 Brainstorm IA sur tous'}
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Nouveau projet</h3>
        <form className="form" onSubmit={openIntake} style={{ marginTop: 10 }}>
          <input className="input" placeholder="Nom du projet" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
          <textarea className="textarea" placeholder="Description (optionnel — l'IA te posera des questions ensuite pour affiner)"
                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" type="submit">✨ Créer avec l'IA</button>
            <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>
              L'IA te pose 5-6 questions pour saisir le sens, tes compétences et tes moyens.
            </span>
          </div>
        </form>
      </div>

      {err && <div className="empty" style={{ color: 'var(--err)', marginBottom: 10 }}>Erreur : {err}</div>}
      {projects.length === 0 && <div className="empty">Aucun projet. Crée le premier.</div>}

      <div className="list">
        {projects.map(p => {
          const mapOpen = openMap === p.id;
          const briefOpen = openBrief === p.id;
          const isBrainstorming = brainstorming === p.id;
          const isBriefing = briefing === p.id;
          return (
            <div key={p.id} className="card fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${p.statut === 'termine' ? 'ok' : p.statut === 'en_cours' ? 'acc' : 'warn'}`}>
                      {STATUTS.find(s => s.k === p.statut)?.label}
                    </span>
                    <span className="badge">prio {p.priorite}</span>
                    {p.mindmap && <span className="badge acc">🧠 mindmap</span>}
                    {p.brief && <span className="badge acc">📄 brief</span>}
                    <strong style={{ fontSize: 16 }}>{p.nom}</strong>
                  </div>
                  {p.description && <div className="meta" style={{ marginTop: 6 }}>{p.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn ghost small" onClick={() => setOpenMap(mapOpen ? null : p.id)}>
                    {mapOpen ? '▲ Mindmap' : '🧠 Carte mentale'}
                  </button>
                  <button className="btn ghost small" onClick={() => setOpenBrief(briefOpen ? null : p.id)}>
                    {briefOpen ? '▲ Brief' : '📄 Brief IA'}
                  </button>
                  <button className="btn ghost small" onClick={() => cycleStatus(p)}>→ statut</button>
                  <button className="btn ghost small" onClick={() => delProject(p.id)}>Suppr.</button>
                </div>
              </div>

              {mapOpen && (
                <div style={{ marginTop: 14 }}>
                  <MindMap mindmap={p.mindmap} loading={isBrainstorming} onRefresh={() => brainstorm(p.id)} />
                </div>
              )}

              {briefOpen && (
                <div style={{ marginTop: 14 }}>
                  <BriefPanel
                    brief={p.brief}
                    loading={isBriefing}
                    onGenerate={() => generateBrief(p.id)}
                    onDownload={() => downloadBrief(p)}
                  />
                </div>
              )}

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
                  <input className="input" placeholder="Nouvelle tâche…"
                         value={taskDrafts[p.id] || ''}
                         onChange={e => setTaskDrafts({ ...taskDrafts, [p.id]: e.target.value })}
                         onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(p.id); } }} />
                  <button className="btn small" onClick={() => addTask(p.id)}>Ajouter</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {intake && (
        <IntakeModal
          intake={intake}
          onClose={() => setIntake(null)}
          onChange={updateAnswer}
          onSubmit={() => finishIntake({ skip: false })}
          onSkip={() => finishIntake({ skip: true })}
        />
      )}

      <ChatWidget expertise="project" />
    </>
  );
}

function IntakeModal({ intake, onClose, onChange, onSubmit, onSkip }) {
  const hasAnswers = Object.values(intake.answers || {}).some(v => String(v || '').trim());
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Questions IA pour ce projet">
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3>✨ Cadrons ton projet : « {intake.nom} »</h3>
            <div style={{ color: 'var(--txt-soft)', fontSize: 12, marginTop: 2 }}>
              Prends 2 min. Ces réponses nourrissent le brief IA, la carte mentale et les conseils.
            </div>
          </div>
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {intake.loading ? (
            <div className="empty">L'IA prépare tes questions…</div>
          ) : intake.questions.length === 0 ? (
            <div className="empty" style={{ color: 'var(--err)' }}>
              Impossible de générer les questions. Crée le projet sans questionnaire ou réessaie.
            </div>
          ) : (
            <div className="form">
              {intake.questions.map((q, i) => (
                <div key={q.id} style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, color: 'var(--txt)' }}>
                    <span style={{ color: 'var(--accent)', marginRight: 6 }}>{i + 1}.</span>
                    {q.titre}
                  </label>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 64 }}
                    placeholder={q.placeholder || 'Ta réponse…'}
                    value={intake.answers[q.id] || ''}
                    onChange={e => onChange(q.id, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn ghost" type="button" onClick={onSkip}>
            Créer sans répondre
          </button>
          <button
            className="btn"
            type="button"
            onClick={onSubmit}
            disabled={intake.loading || !hasAnswers}
            title={!hasAnswers ? 'Réponds à au moins une question' : ''}
          >
            Créer le projet
          </button>
        </div>
      </div>
    </div>
  );
}

function BriefPanel({ brief, loading, onGenerate, onDownload }) {
  const has = brief?.markdown;
  return (
    <div style={{ border: '1px solid var(--line-soft)', borderRadius: 10, padding: 14, background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
          {has
            ? `Brief généré ${brief.generatedAt ? 'le ' + new Date(brief.generatedAt).toLocaleString('fr-FR') : ''}`
            : 'Aucun brief généré pour ce projet.'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost small" onClick={onGenerate} disabled={loading}>
            {loading ? 'IA génère…' : has ? '↻ Régénérer' : '✨ Générer'}
          </button>
          {has && <button className="btn small" onClick={onDownload}>⬇ Télécharger .md</button>}
        </div>
      </div>
      {has && (
        <pre style={{
          marginTop: 12,
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: 13,
          color: 'var(--txt)',
          lineHeight: 1.55,
        }}>{brief.markdown}</pre>
      )}
    </div>
  );
}
