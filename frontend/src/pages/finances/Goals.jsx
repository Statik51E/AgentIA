import { useState } from 'react';
import { api } from '../../lib/api.js';

export default function Goals({ goals, accounts, onChanged }) {
  const [form, setForm] = useState({ nom: '', cible: '', actuel: '', deadline: '', account_id: '' });
  const [contrib, setContrib] = useState({}); // { [goalId]: '50' }

  const add = async (e) => {
    e.preventDefault();
    const cible = parseFloat(form.cible);
    if (!form.nom.trim() || !cible || cible <= 0) return;
    await api.finances.addGoal({
      nom: form.nom.trim(),
      cible,
      actuel: parseFloat(form.actuel) || 0,
      deadline: form.deadline || null,
      account_id: form.account_id ? Number(form.account_id) : null,
    });
    setForm({ nom: '', cible: '', actuel: '', deadline: '', account_id: '' });
    onChanged?.();
  };
  const del = async (id) => { await api.finances.delGoal(id); onChanged?.(); };
  const contribute = async (id, sign = 1) => {
    const m = parseFloat(contrib[id]);
    if (!m) return;
    await api.finances.contributeGoal(id, sign * m);
    setContrib({ ...contrib, [id]: '' });
    onChanged?.();
  };

  const total = goals.reduce((s, g) => s + (g.actuel || 0), 0);
  const cible = goals.reduce((s, g) => s + (g.cible || 0), 0);

  return (
    <>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card fade-in">
          <h3>Épargne totale</h3>
          <div className="big" style={{ color: 'var(--ok)' }}>{fmt(total)} €</div>
          <div className="delta">Objectif cumulé : {fmt(cible)} €</div>
          {cible > 0 && (
            <div className="meter" style={{ marginTop: 10 }}>
              <span style={{ width: `${Math.min(100, Math.round((total / cible) * 100))}%`, background: 'var(--ok)' }} />
            </div>
          )}
        </div>
        <div className="card">
          <h3>Nouvel objectif</h3>
          <form className="form" onSubmit={add}>
            <input className="input" placeholder="Nom (Vacances, Apport…)"
                   value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
            <div className="row2">
              <input className="input" type="number" step="1" placeholder="Cible (€)"
                     value={form.cible} onChange={e => setForm({ ...form, cible: e.target.value })} required />
              <input className="input" type="number" step="1" placeholder="Déjà épargné (€)"
                     value={form.actuel} onChange={e => setForm({ ...form, actuel: e.target.value })} />
            </div>
            <div className="row2">
              <input className="input" type="date" placeholder="Deadline"
                     value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
              <select className="select" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                <option value="">— Compte lié —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
            <button className="btn" type="submit">Créer</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h3>Objectifs en cours</h3>
        {goals.length === 0 ? (
          <div className="empty">Pas encore d'objectif. Crée-en un pour suivre ta progression.</div>
        ) : (
          <div className="list">
            {goals.map(g => {
              const pct = Math.min(100, Math.round(((g.actuel || 0) / g.cible) * 100));
              const done = g.actuel >= g.cible;
              const acc = accounts.find(a => a.id === g.account_id);
              const dl = g.deadline ? daysUntil(g.deadline) : null;
              const restant = Math.max(0, g.cible - (g.actuel || 0));
              return (
                <div key={g.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <span className="title">{g.nom}</span>
                      {done && <span className="badge ok" style={{ marginLeft: 8 }}>atteint</span>}
                      {acc && <span className="badge" style={{ marginLeft: 6 }}>{acc.nom}</span>}
                      {dl != null && (
                        <span className={`badge ${dl < 0 ? 'err' : dl < 30 ? 'warn' : ''}`} style={{ marginLeft: 6 }}>
                          {dl < 0 ? `dépassé de ${-dl}j` : `J-${dl}`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14 }}>
                      <strong>{fmt(g.actuel)} €</strong>
                      <span style={{ color: 'var(--txt-soft)' }}> / {fmt(g.cible)} €</span>
                      <span style={{ marginLeft: 8, color: done ? 'var(--ok)' : 'var(--accent)' }}>{pct}%</span>
                    </div>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${pct}%`, background: done ? 'var(--ok)' : 'var(--accent)' }} />
                  </div>
                  {restant > 0 && <div className="meta" style={{ color: 'var(--txt-soft)' }}>Reste {fmt(restant)} € à épargner.</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input className="input" type="number" step="1" placeholder="Montant (€)" style={{ maxWidth: 160 }}
                           value={contrib[g.id] || ''} onChange={e => setContrib({ ...contrib, [g.id]: e.target.value })} />
                    <button className="btn small" onClick={() => contribute(g.id, 1)}>+ Ajouter</button>
                    <button className="btn ghost small" onClick={() => contribute(g.id, -1)}>− Retirer</button>
                    <button className="btn ghost small" onClick={() => del(g.id)} style={{ marginLeft: 'auto' }}>Supprimer</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
function daysUntil(iso) {
  try {
    const d = new Date(iso);
    const now = new Date(); now.setHours(0,0,0,0);
    return Math.round((d - now) / 86400000);
  } catch { return null; }
}
