import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';

export default function Idees() {
  const [ideas, setIdeas] = useState([]);
  const [contenu, setContenu] = useState('');

  const load = async () => setIdeas(await api.ideas.list());
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!contenu.trim()) return;
    await api.ideas.add({ contenu });
    setContenu(''); load();
  };
  const del = async (id) => { await api.ideas.del(id); load(); };
  const convert = async (id) => { await api.ideas.convert(id); load(); };

  return (
    <>
      <TopBar title="Idées" sub="Capture rapide · structuration auto · conversion en projet" />

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
  );
}

function formatDate(s) { try { return new Date(s).toLocaleString('fr-FR'); } catch { return s; } }
