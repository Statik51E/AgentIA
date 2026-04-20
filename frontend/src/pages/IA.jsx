import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';

export default function IA() {
  const [entree, setEntree] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [actions, setActions] = useState([]);
  const [tab, setTab] = useState('suggere'); // suggere | valide | historique

  const loadActions = async () => setActions(await api.actions.list());
  useEffect(() => { loadActions(); }, []);

  const analyze = async (e) => {
    e.preventDefault();
    if (!entree.trim()) return;
    setLoading(true); setErr('');
    try { setResult(await api.ai.analyze(entree)); }
    catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  };

  const validate = async (id) => { await api.actions.validate(id); loadActions(); };
  const reject   = async (id) => { await api.actions.reject(id); loadActions(); };
  const runCycle = async () => { await api.suggestions.run(); loadActions(); };

  const filtered = actions.filter(a => {
    if (tab === 'suggere')   return a.statut === 'suggere';
    if (tab === 'valide')    return a.statut === 'execute' || a.statut === 'valide';
    return true;
  });

  return (
    <>
      <TopBar
        title="CORE IA"
        sub="Analyse · structure · optimise · challenge"
        right={<button className="btn ghost small" onClick={runCycle}>Générer suggestions</button>}
      />

      <div className="grid cols-2">
        <div className="card">
          <h3>Parler au CORE</h3>
          <form className="form" onSubmit={analyze} style={{ marginTop: 10 }}>
            <textarea
              className="textarea"
              placeholder="Écris n'importe quoi — idée, dépense, projet, question. Le CORE détecte et structure."
              value={entree}
              onChange={e => setEntree(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); analyze(e); } }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Analyse…' : 'Analyser'}
              </button>
              <span style={{ color: 'var(--txt-soft)', fontSize: 12, alignSelf: 'center' }}>
                <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span>
              </span>
            </div>
          </form>

          {err && <div className="empty" style={{ color: 'var(--err)' }}>Erreur : {err}</div>}

          {result && (
            <div className="fade-in" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <Section title="Analyse"       text={result.analyse} badge={result.type} />
              <Section title="Structure"     text={result.structure} pre />
              <Section title="Améliorations" text={result.ameliorations} />
              {result.actions?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: .5 }}>Actions</h4>
                  <div className="list">
                    {result.actions.map((a, i) => (
                      <div key={i} className="row"><div className="title">{a}</div><span className="badge acc">proposée</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Décisions IA</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <Tab k="suggere"    label="Suggérées"   tab={tab} setTab={setTab} />
              <Tab k="valide"     label="Validées"    tab={tab} setTab={setTab} />
              <Tab k="historique" label="Historique"  tab={tab} setTab={setTab} />
            </div>
          </div>

          <div className="list" style={{ marginTop: 12 }}>
            {filtered.length === 0 && <div className="empty">Rien à afficher.</div>}
            {filtered.map(a => (
              <div key={a.id} className="row">
                <div style={{ flex: 1 }}>
                  <div className="title">{a.description}</div>
                  <div className="meta">
                    <span className={`badge ${a.statut === 'suggere' ? 'warn' : a.statut === 'execute' ? 'ok' : a.statut === 'rejete' ? 'err' : 'acc'}`}>
                      {a.statut}
                    </span>{' '}
                    <span className="badge">{a.type}</span>{' '}
                    <span style={{ color: 'var(--txt-soft)' }}>{formatDate(a.date)}</span>
                  </div>
                </div>
                {a.statut === 'suggere' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn small" onClick={() => validate(a.id)}>Valider</button>
                    <button className="btn ghost small" onClick={() => reject(a.id)}>Rejeter</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, text, pre, badge }) {
  if (!text) return null;
  return (
    <div>
      <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: .5 }}>
        {title} {badge && <span className="badge acc" style={{ marginLeft: 6 }}>{badge}</span>}
      </h4>
      {pre
        ? <pre style={{ margin: 0, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 10, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: 'var(--txt-dim)' }}>{text}</pre>
        : <p style={{ margin: 0, color: 'var(--txt-dim)', lineHeight: 1.55 }}>{text}</p>}
    </div>
  );
}

function Tab({ k, label, tab, setTab }) {
  return (
    <button className={'btn ghost small' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}
            style={tab === k ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--txt)' } : undefined}>
      {label}
    </button>
  );
}

function formatDate(s) { try { return new Date(s).toLocaleString('fr-FR'); } catch { return s; } }
