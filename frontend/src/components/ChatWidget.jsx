import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const EXPERTS = {
  finance: {
    title: 'AgIa — Expert Finances',
    subtitle: 'Budget · épargne · crédits · optimisation',
    placeholder: 'Ex : comment réduire mon budget courses ?',
    system: `Tu es AgIa, assistant expert en finances personnelles. Tu es direct, concret, et tu n'inventes rien.
Tu aides l'utilisateur à : analyser son budget, optimiser ses dépenses, rembourser ses crédits, épargner, renégocier ses charges fixes, sortir du découvert.
Règles :
- Si on te demande un conseil général, donne une réponse actionnable avec étapes numérotées.
- Si on te demande un calcul (mensualité, taux, reste à vivre, capacité d'épargne), fais le calcul et montre la formule.
- Utilise l'euro (€) et des pourcentages concrets.
- Refuse poliment : conseils boursiers spéculatifs, crypto-trading, fraude fiscale.
- Français, ton direct et bienveillant. Phrases courtes. Pas de markdown lourd.`,
  },
  project: {
    title: 'AgIa — Expert Gestion de Projet',
    subtitle: 'Priorisation · planification · livrables · risques',
    placeholder: 'Ex : aide-moi à cadrer ce projet en 5 étapes',
    system: `Tu es AgIa, assistant expert en gestion de projet personnel et professionnel. Tu es direct, pragmatique, structuré.
Tu aides l'utilisateur à : cadrer un projet, définir objectifs et livrables, découper en tâches, prioriser, identifier risques et dépendances, estimer effort, rédiger briefs.
Règles :
- Pose UNE question de clarification si le besoin est flou, sinon réponds directement.
- Pour une décomposition, utilise des listes courtes et ordonnées.
- N'invente pas de deadlines précises sans données.
- Challenge les idées floues, propose des critères de succès mesurables.
- Français, ton direct, phrases courtes. Pas de blabla.`,
  },
};

export default function ChatWidget({ expertise = 'finance' }) {
  const config = EXPERTS[expertise] || EXPERTS.finance;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Reset conversation when switching expertise
  useEffect(() => { setMessages([]); setErr(''); }, [expertise]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true); setErr('');
    try {
      let systemWithContext = config.system;
      try {
        const ctx = await api.context.snapshot(expertise);
        if (ctx && !ctx.error) {
          systemWithContext = `${config.system}

Contexte temps-réel de l'utilisateur (données actuelles de son compte, à utiliser pour répondre précisément — n'invente rien au-delà) :
${JSON.stringify(ctx, null, 2)}`;
        }
      } catch {}
      const reply = await api.ai.chat({ system: systemWithContext, messages: next });
      setMessages([...next, { role: 'assistant', content: reply || '…' }]);
    } catch (ex) {
      setErr(ex.message);
      setMessages([...next, { role: 'assistant', content: `⚠ Erreur : ${ex.message}` }]);
    } finally { setLoading(false); }
  };

  const clear = () => { setMessages([]); setErr(''); };

  return (
    <>
      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Fermer le chat AgIa' : 'Ouvrir le chat AgIa'}
      >
        <img
          src={`${import.meta.env.BASE_URL}icons/agia.png`}
          alt="AgIa"
          style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }}
        />
        {!open && <span style={pulseDot} />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={config.title}
          className="chat-panel"
        >
          <header style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid var(--line-soft)',
            background: 'var(--bg-2, rgba(255,255,255,0.03))',
          }}>
            <img
              src={`${import.meta.env.BASE_URL}icons/agia.png`}
              alt=""
              style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{config.title}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-soft)' }}>{config.subtitle}</div>
            </div>
            <button className="btn ghost small" onClick={clear} title="Nouvelle conversation">↻</button>
            <button className="btn ghost small" onClick={() => setOpen(false)} title="Fermer">✕</button>
          </header>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{ color: 'var(--txt-soft)', fontSize: 13, lineHeight: 1.55 }}>
                Pose ta question — {config.subtitle.toLowerCase()}.
                <br /><br />
                <em style={{ color: 'var(--txt-dim)' }}>{config.placeholder}</em>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: m.role === 'user' ? 'var(--accent, #7c5cff)' : 'var(--bg-2, rgba(255,255,255,0.04))',
                  color: m.role === 'user' ? '#000' : 'var(--txt)',
                  whiteSpace: 'pre-wrap',
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: m.role === 'assistant' ? '1px solid var(--line-soft)' : 'none',
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '8px 12px',
                borderRadius: 12,
                background: 'var(--bg-2, rgba(255,255,255,0.04))',
                border: '1px solid var(--line-soft)',
                color: 'var(--txt-dim)',
                fontSize: 13,
              }}>AgIa réfléchit…</div>
            )}
            <div ref={endRef} />
          </div>

          {err && (
            <div style={{ padding: '6px 14px', color: 'var(--err)', fontSize: 12, borderTop: '1px solid var(--line-soft)' }}>
              {err}
            </div>
          )}

          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line-soft)' }}>
            <input
              ref={inputRef}
              className="input"
              placeholder={config.placeholder}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button className="btn" type="submit" disabled={loading || !input.trim()}>
              {loading ? '…' : 'Envoyer'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const pulseDot = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#3bbeff',
  boxShadow: '0 0 8px #3bbeff',
};
