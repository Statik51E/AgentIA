import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { testGroqKey } from '../lib/aiClient.js';
import TopBar from '../components/TopBar.jsx';
import { useAuth } from '../lib/auth.jsx';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export default function Settings() {
  const { user } = useAuth();
  const [keys, setKeys] = useState([]); // string[]
  const [newKey, setNewKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState({}); // key -> {state, message}
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await api.settings.get();
        const loaded = [];
        if (Array.isArray(s?.groqApiKeys)) loaded.push(...s.groqApiKeys);
        if (typeof s?.groqApiKey === 'string' && s.groqApiKey.trim()) loaded.push(s.groqApiKey.trim());
        const unique = [...new Set(loaded.map(k => k.trim()).filter(Boolean))];
        setKeys(unique);
        if (s?.groqModel) setModel(s.groqModel);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  const addKey = () => {
    const k = newKey.trim();
    if (!k) return;
    if (keys.includes(k)) { setErr('Cette clé est déjà présente.'); return; }
    setKeys([...keys, k]);
    setNewKey('');
    setErr('');
  };

  const removeKey = (k) => {
    setKeys(keys.filter(x => x !== k));
    setTestResults(prev => {
      const c = { ...prev };
      delete c[k];
      return c;
    });
  };

  const save = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.settings.save({
        groqApiKeys: keys,
        groqApiKey: keys[0] || '', // backwards compat
        groqModel: model.trim() || DEFAULT_MODEL,
      });
      setSaved(Date.now());
      setTimeout(() => setSaved(null), 2000);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const testOne = async (k) => {
    setTestResults(prev => ({ ...prev, [k]: { state: 'loading' } }));
    const res = await testGroqKey(k, model || DEFAULT_MODEL);
    setTestResults(prev => ({
      ...prev,
      [k]: res.ok
        ? { state: 'ok' }
        : { state: 'ko', message: res.status ? `${res.status} — ${res.message}` : res.message },
    }));
  };

  const testAll = async () => {
    for (const k of keys) {
      // séquentiel pour éviter de tout flood en même temps
      // eslint-disable-next-line no-await-in-loop
      await testOne(k);
    }
  };

  return (
    <>
      <TopBar title="Paramètres" sub="Tes clés Groq sont stockées dans ton compte Firestore" />

      <div className="card fade-in" style={{ marginBottom: 16 }}>
        <h3>Compte</h3>
        <div className="meta" style={{ marginTop: 8 }}>
          <div><strong>Email :</strong> {user?.email || '—'}</div>
          <div><strong>UID :</strong> <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{user?.uid}</span></div>
        </div>
      </div>

      <div className="card fade-in">
        <h3>Clés API Groq ({keys.length})</h3>
        <p style={{ color: 'var(--txt-soft)', fontSize: 13, marginTop: 4 }}>
          Crée des clés gratuites sur{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            console.groq.com/keys
          </a>{' '}
          — ajoutes-en plusieurs pour ne jamais être bloqué par la limite de requêtes. L'app fait tourner tes clés en round-robin et contourne automatiquement celles en rate-limit.
        </p>

        <form
          className="form"
          onSubmit={(e) => { e.preventDefault(); addKey(); }}
          style={{ marginTop: 12 }}
        >
          <div className="row2">
            <input
              className="input"
              type="password"
              placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!newKey.trim()}>Ajouter la clé</button>
          </div>
        </form>

        <div className="list" style={{ marginTop: 14 }}>
          {keys.length === 0 && <div className="empty">Aucune clé enregistrée — ajoute-en une ci-dessus.</div>}
          {keys.map((k, i) => {
            const res = testResults[k];
            return (
              <div key={k} className="row">
                <div style={{ minWidth: 0 }}>
                  <div className="title" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    #{i + 1} · {maskKey(k)}
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    {!res && <span style={{ color: 'var(--txt-dim)' }}>non testée</span>}
                    {res?.state === 'loading' && <span style={{ color: 'var(--txt-dim)' }}>test en cours…</span>}
                    {res?.state === 'ok' && <span style={{ color: 'var(--ok)' }}>✓ valide</span>}
                    {res?.state === 'ko' && <span style={{ color: 'var(--err)' }}>✗ {res.message || 'invalide'}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost small" type="button" onClick={() => testOne(k)} disabled={res?.state === 'loading'}>
                    Tester
                  </button>
                  <button className="btn ghost small" type="button" onClick={() => removeKey(k)}>
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <form className="form" onSubmit={save} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Modèle</label>
            <input className="input" placeholder={DEFAULT_MODEL}
                   value={model} onChange={e => setModel(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
            <button className="btn ghost" type="button" onClick={testAll} disabled={keys.length === 0}>
              Tester toutes les clés
            </button>
            {saved && <span style={{ color: 'var(--ok)', fontSize: 13 }}>✓ enregistré</span>}
          </div>
        </form>

        {err && <div className="empty" style={{ color: 'var(--err)', marginTop: 10 }}>Erreur : {err}</div>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Comment ça marche</h3>
        <ul style={{ color: 'var(--txt-dim)', lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Tu peux enregistrer <strong>autant de clés</strong> que tu veux — l'app les utilise en rotation.</li>
          <li>Si une clé est en rate-limit (erreur 429), elle est mise en pause 60 s et la suivante prend le relais automatiquement.</li>
          <li>Si une clé est invalide (401/403), elle est mise en pause 10 min — supprime-la si le souci persiste.</li>
          <li>Tes clés sont stockées <strong>uniquement</strong> dans ton profil Firestore, lisibles seulement par toi.</li>
          <li>Sans clé valide, toutes les fonctions IA (analyse, conseils, relevé, brainstorm, suggestions) seront indisponibles.</li>
        </ul>
      </div>
    </>
  );
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return k;
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
