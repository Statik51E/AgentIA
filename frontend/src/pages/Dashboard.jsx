import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import { StatCard, ScoreCard } from '../components/Card.jsx';

export default function Dashboard() {
  const [daily, setDaily] = useState(null);
  const [fin, setFin] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [d, f, s] = await Promise.all([api.ai.daily(), api.finances.summary(), api.suggestions.list()]);
      setDaily(d); setFin(f); setSuggestions(s);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const validate = async (id) => { await api.actions.validate(id); load(); };
  const reject   = async (id) => { await api.actions.reject(id); load(); };
  const runCycle = async () => { await api.suggestions.run(); load(); };

  return (
    <>
      <TopBar
        title="Dashboard"
        sub={daily?.date ? `Synthèse du ${daily.date}` : 'Vue globale'}
        right={<button className="btn ghost small" onClick={runCycle}>Analyser maintenant</button>}
      />

      {err && <div className="card" style={{ borderColor: 'rgba(255,107,107,0.3)' }}>Erreur : {err}</div>}

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <ScoreCard title="Score financier"   score={daily?.financeScore}      hint={fin ? `Solde ${fmt(fin.solde)} €` : '—'} />
        <ScoreCard title="Productivité"      score={daily?.productivityScore} hint={daily ? `${daily.counts.taches_ouvertes} tâches ouvertes` : '—'} />
        <StatCard  title="Projets"           value={daily?.counts.projets ?? '—'}          hint="Total actifs" />
        <StatCard  title="Idées"             value={daily?.counts.idees ?? '—'}            hint="En attente" accent />
      </div>

      <div className="grid cols-2">
        <div className="card fade-in">
          <h3>Résumé CORE IA</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--txt-dim)', lineHeight: 1.55 }}>
            {daily?.resume || 'Aucune donnée pour le moment. Commence par ajouter une finance, un projet ou une idée.'}
          </p>
        </div>

        <div className="card fade-in">
          <h3>Suggestions IA</h3>
          {suggestions.length === 0 ? (
            <div className="empty">Aucune suggestion en attente.</div>
          ) : (
            <div className="list" style={{ marginTop: 10 }}>
              {suggestions.slice(0, 5).map(s => (
                <div key={s.id} className="row">
                  <div style={{ flex: 1, paddingRight: 10 }}>
                    <div className="title">{s.description}</div>
                    <div className="meta"><span className="badge acc">{s.type}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn small" onClick={() => validate(s.id)}>Valider</button>
                    <button className="btn ghost small" onClick={() => reject(s.id)}>Rejeter</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
