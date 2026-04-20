import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase.js';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (ex) { setErr(friendly(ex.code || ex.message)); }
    finally { setLoading(false); }
  };

  const google = async () => {
    setErr(''); setLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (ex) { setErr(friendly(ex.code || ex.message)); }
    finally { setLoading(false); }
  };

  return (
    <div style={wrap}>
      <div className="card fade-in" style={{ maxWidth: 420, width: '100%' }}>
        <h2 style={{ marginTop: 0 }}>CORE IA ULTIMATE</h2>
        <p style={{ color: 'var(--txt-soft)', marginTop: -4, fontSize: 13 }}>
          Tes données restent privées — elles sont rattachées uniquement à ton compte.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button className={`btn ${mode === 'login' ? '' : 'ghost'} small`} onClick={() => setMode('login')}>Connexion</button>
          <button className={`btn ${mode === 'signup' ? '' : 'ghost'} small`} onClick={() => setMode('signup')}>Créer un compte</button>
        </div>

        <form className="form" onSubmit={submit}>
          <input className="input" type="email" placeholder="Email"
                 value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Mot de passe (6 car min)"
                 value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? '...' : (mode === 'login' ? 'Se connecter' : 'Créer mon compte')}
          </button>
        </form>

        <div style={{ textAlign: 'center', margin: '14px 0 10px', color: 'var(--txt-soft)', fontSize: 12 }}>ou</div>
        <button className="btn ghost" style={{ width: '100%' }} onClick={google} disabled={loading}>
          Continuer avec Google
        </button>

        {err && <div className="empty" style={{ color: 'var(--err)', marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}

const wrap = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };

function friendly(code) {
  const map = {
    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cet email.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
    'auth/weak-password': 'Mot de passe trop faible (6 car min).',
    'auth/invalid-email': 'Email invalide.',
    'auth/popup-closed-by-user': 'Fenêtre Google fermée.',
    'auth/network-request-failed': 'Problème réseau.',
  };
  return map[code] || code;
}
