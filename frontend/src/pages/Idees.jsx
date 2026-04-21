import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';

export default function Idees() {
  const [ideas, setIdeas] = useState([]);
  const [contenu, setContenu] = useState('');
  const [org, setOrg] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => setIdeas(await api.ideas.list());
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!contenu.trim()) return;
    await api.ideas.add({ contenu });
    setContenu(''); load();
  };
  const del = async (id) => { await api.ideas.del(id); load(); setOrg(null); };
  const convert = async (id) => { await api.ideas.convert(id); load(); setOrg(null); };

  const organize = async () => {
    setLoadingOrg(true); setErr('');
    try { setOrg(await api.ai.organizeIdeas()); }
    catch (e) { setErr(e.message); }
    finally { setLoadingOrg(false); }
  };

  const ideaMap = useMemo(() => Object.fromEntries(ideas.map(i => [i.id, i])), [ideas]);
  const groupedIds = useMemo(() => {
    const s = new Set();
    for (const g of (org?.groupes || [])) g.ideas_ids.forEach(id => s.add(id));
    return s;
  }, [org]);
  const ungrouped = ideas.filter(i => !groupedIds.has(i.id));

  return (
    <>
      <TopBar
        title="Idées"
        sub="Capture · structuration auto · conversion en projet"
        right={
          <button className="btn ghost small" onClick={organize} disabled={loadingOrg || ideas.length === 0}>
            {loadingOrg ? 'IA organise…' : '⚡ Organiser avec l\'IA'}
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Nouvelle idée</h3>
        <form className="form" onSubmit={add} style={{ marginTop: 10 }}>
          <textarea className="textarea" placeholder="Lance ton idée — l'IA la structurera automatiquement."
                    value={contenu} onChange={e => setContenu(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="submit">Capturer</button>
            <span style={{ color: 'var(--txt-soft)', fontSize: 12, alignSelf: 'center' }}>
              Raccourci : <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span>
            </span>
          </div>
        </form>
      </div>

      {err && <div className="empty" style={{ color: 'var(--err)', marginBottom: 10 }}>Erreur : {err}</div>}

      {org && (
        <>
          {org.resume && (
            <div className="card fade-in" style={{ marginBottom: 16 }}>
              <h3>Synthèse IA</h3>
              <p style={{ color: 'var(--txt-dim)', lineHeight: 1.6, marginTop: 6 }}>{org.resume}</p>
            </div>
          )}

          {(org.a_convertir?.length || 0) > 0 && (
            <div className="card fade-in" style={{ marginBottom: 16 }}>
              <h3>À convertir en projet ({org.a_convertir.length})</h3>
              <div className="list" style={{ marginTop: 8 }}>
                {org.a_convertir.map(a => {
                  const idea = ideaMap[a.id];
                  if (!idea) return null;
                  return (
                    <div key={a.id} className="row">
                      <div style={{ flex: 1 }}>
                        <div className="title" style={{ whiteSpace: 'pre-wrap' }}>{idea.contenu}</div>
                        <div className="meta" style={{ color: 'var(--txt-soft)', marginTop: 4 }}>{a.raison}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn small" onClick={() => convert(a.id)}>→ Projet</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(org.doublons?.length || 0) > 0 && (
            <div className="card fade-in" style={{ marginBottom: 16 }}>
              <h3>Doublons détectés</h3>
              <div className="list" style={{ marginTop: 8 }}>
                {org.doublons.map((d, i) => (
                  <div key={i} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 6 }}>{d.raison}</div>
                    <div style={{ display: 'grid', gap: 4, paddingLeft: 12, borderLeft: '2px solid var(--warn)' }}>
                      {d.ids.map(id => {
                        const idea = ideaMap[id];
                        return idea ? (
                          <div key={id} style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
                            • {truncate(idea.contenu, 120)}
                            <button className="btn ghost small" style={{ marginLeft: 8 }} onClick={() => del(id)}>Suppr.</button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(org.groupes?.length || 0) > 0 && (
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              {org.groupes.map((g, i) => (
                <div key={i} className="card fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>{g.theme} <span style={{ color: 'var(--txt-soft)', fontSize: 13, fontWeight: 400 }}>({g.ideas_ids.length})</span></h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="badge acc">{g.action_suggeree}</span>
                      <span className="badge">priorité {g.priorite}</span>
                    </div>
                  </div>
                  <div style={{ color: 'var(--txt-soft)', fontSize: 13, marginTop: 4 }}>{g.description}</div>
                  <div className="list" style={{ marginTop: 10 }}>
                    {g.ideas_ids.map(id => {
                      const idea = ideaMap[id];
                      return idea ? <IdeaRow key={id} idea={idea} onConvert={convert} onDel={del} /> : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {ungrouped.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Non classées ({ungrouped.length})</h3>
              <div className="list" style={{ marginTop: 8 }}>
                {ungrouped.map(i => <IdeaRow key={i.id} idea={i} onConvert={convert} onDel={del} />)}
              </div>
            </div>
          )}
        </>
      )}

      {!org && (
        <>
          {ideas.length === 0 && <div className="empty">Aucune idée. Note-en une !</div>}
          <div className="list">
            {ideas.map(i => (
              <div key={i.id} className="card fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div className="title" style={{ whiteSpace: 'pre-wrap' }}>{i.contenu}</div>
                    {i.structure && (
                      <pre style={{
                        background: 'var(--bg-2)', border: '1px solid var(--line-soft)',
                        borderRadius: 10, padding: 12, marginTop: 10,
                        color: 'var(--txt-dim)', fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: 13,
                      }}>{i.structure}</pre>
                    )}
                    <div className="meta" style={{ marginTop: 8 }}>{formatDate(i.date)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn small" onClick={() => convert(i.id)}>→ Projet</button>
                    <button className="btn ghost small" onClick={() => del(i.id)}>Suppr.</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function IdeaRow({ idea, onConvert, onDel }) {
  return (
    <div className="row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title" style={{ whiteSpace: 'pre-wrap' }}>{truncate(idea.contenu, 240)}</div>
        <div className="meta" style={{ marginTop: 4 }}>{formatDate(idea.date)}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn small" onClick={() => onConvert(idea.id)}>→ Projet</button>
        <button className="btn ghost small" onClick={() => onDel(idea.id)}>Suppr.</button>
      </div>
    </div>
  );
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}
function formatDate(s) { try { return new Date(s).toLocaleString('fr-FR'); } catch { return s; } }
