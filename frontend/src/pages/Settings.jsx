import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Settings() {
  const { user } = useAuth();
  const [key, setKey] = useState('');
  const [model, setModel] = useState('llama-3.3-70b-versatile');
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testState, setTestState] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await api.settings.get();
        if (s?.groqApiKey) setKey(s.groqApiKey);
        if (s?.groqModel) setModel(s.groqModel);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  const save = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.settings.save({ groqApiKey: key.trim(), groqModel: model.trim() || 'llama-3.3-70b-versatile' });
      setSaved(Date.now());
      setTimeout(() => setSaved(null), 2000);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const test = async () => {
    setTestState('loading'); setErr('');
    try {
      await api.ai.analyze('Test : Claude, confirme que ton API fonctionne.');
      setTestState('ok');
    } catch (e) { setTestState('ko'); setErr(e.message); }
  };

  return (
    <>
      <TopBar title="Paramètres" sub="Ta clé Groq est stockée dans ton compte, chiffrée via Firestore" />

      <div className="card fade-in" style={{ marginBottom: 16 }}>
        <h3>Compte</h3>
        <div className="meta" style={{ marginTop: 8 }}>
          <div><strong>Email :</strong> {user?.email || '—'}</div>
          <div><strong>UID :</strong> <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{user?.uid}</span></div>
        </div>
      </div>

      <div className="card fade-in">
        <h3>Clé API Groq</h3>
        <p style={{ color: 'var(--txt-soft)', fontSize: 13, marginTop: 4 }}>
          Crée une clé gratuite sur{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            console.groq.com/keys
          </a>{' '}
          — elle restera dans ton compte Firebase et sera utilisée uniquement par toi.
        </p>

        <form className="form" onSubmit={save} style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Clé API</label>
            <input className="input" type="password" placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
                   value={key} onChange={e => setKey(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Modèle</label>
            <input className="input" placeholder="llama-3.3-70b-versatile"
                   value={model} onChange={e => setModel(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" type="submit" disabled={loading || !key.trim()}>
              {loading ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
            <button className="btn ghost" type="button" onClick={test} disabled={!key.trim() || testState === 'loading'}>
              {testState === 'loading' ? 'Test…' : 'Tester la clé'}
            </button>
            {saved && <span style={{ color: 'var(--ok)', fontSize: 13 }}>✓ enregistré</span>}
            {testState === 'ok' && <span style={{ color: 'var(--ok)', fontSize: 13 }}>✓ clé valide</span>}
            {testState === 'ko' && <span style={{ color: 'var(--err)', fontSize: 13 }}>✗ clé invalide</span>}
          </div>
        </form>

        {err && <div className="empty" style={{ color: 'var(--err)', marginTop: 10 }}>Erreur : {err}</div>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Comment ça marche</h3>
        <ul style={{ color: 'var(--txt-dim)', lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Ta clé est stockée <strong>uniquement</strong> dans ton profil Firestore, lisible seulement par toi.</li>
          <li>L'app appelle Groq directement depuis ton navigateur avec ta clé — personne d'autre n'y a accès.</li>
          <li>Tu peux la remplacer ou la supprimer à tout moment ici.</li>
          <li>Sans clé, toutes les fonctions IA (analyse, conseils, relevé, brainstorm, suggestions) seront indisponibles.</li>
        </ul>
      </div>
    </>
  );
}
