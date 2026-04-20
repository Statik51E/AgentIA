import { useState } from 'react';
import { api } from '../../lib/api.js';

const TYPES = [
  { v: 'courant', label: 'Courant', color: '#7c5cff' },
  { v: 'epargne', label: 'Épargne', color: '#37d399' },
  { v: 'espece',  label: 'Espèces', color: '#f2b94b' },
  { v: 'credit',  label: 'Crédit',  color: '#ff6b6b' },
  { v: 'autre',   label: 'Autre',   color: '#a0a0ab' },
];

export default function Accounts({ accounts, onChanged }) {
  const [form, setForm] = useState({ nom: '', type: 'courant', solde_initial: '' });
  const [transfer, setTransfer] = useState({ from_id: '', to_id: '', montant: '', note: '' });
  const [err, setErr] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    await api.finances.addAccount({
      nom: form.nom.trim(),
      type: form.type,
      solde_initial: parseFloat(form.solde_initial) || 0,
    });
    setForm({ nom: '', type: 'courant', solde_initial: '' });
    onChanged?.();
  };
  const del = async (id) => {
    if (!confirm('Supprimer ce compte ? Les transactions seront détachées.')) return;
    await api.finances.delAccount(id);
    onChanged?.();
  };
  const doTransfer = async (e) => {
    e.preventDefault();
    setErr('');
    const m = parseFloat(transfer.montant);
    if (!transfer.from_id || !transfer.to_id || !m || m <= 0) { setErr('Champs invalides'); return; }
    if (transfer.from_id === transfer.to_id) { setErr('Les comptes doivent être différents'); return; }
    try {
      await api.finances.transfer({
        from_id: transfer.from_id,
        to_id: transfer.to_id,
        montant: m,
        note: transfer.note || null,
      });
      setTransfer({ from_id: '', to_id: '', montant: '', note: '' });
      onChanged?.();
    } catch (ex) { setErr(ex.message); }
  };

  const total = accounts.reduce((s, a) => s + (a.solde || 0), 0);

  return (
    <>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card fade-in">
          <h3>Patrimoine total</h3>
          <div className="big" style={{ color: total >= 0 ? 'var(--ok)' : 'var(--err)' }}>{fmt(total)} €</div>
          <div className="delta">Sur {accounts.length} compte{accounts.length > 1 ? 's' : ''}</div>
        </div>
        <div className="card">
          <h3>Nouveau compte</h3>
          <form className="form" onSubmit={add}>
            <input className="input" placeholder="Nom (Boursorama, Livret A…)"
                   value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
            <div className="row2">
              <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
              <input className="input" type="number" step="0.01" placeholder="Solde initial (€)"
                     value={form.solde_initial} onChange={e => setForm({ ...form, solde_initial: e.target.value })} />
            </div>
            <button className="btn" type="submit">Créer</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Tes comptes</h3>
        {accounts.length === 0 ? (
          <div className="empty">Crée ton premier compte pour commencer à lier tes transactions.</div>
        ) : (
          <div className="list">
            {accounts.map(a => {
              const meta = TYPES.find(t => t.v === a.type) || TYPES[0];
              return (
                <div key={a.id} className="row">
                  <div>
                    <div className="title">
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: meta.color, borderRadius: 4, marginRight: 8 }} />
                      {a.nom} <span className="badge" style={{ marginLeft: 6 }}>{meta.label}</span>
                    </div>
                    <div className="meta">
                      Solde initial : {fmt(a.solde_initial)} € · Entrées : +{fmt(a.entrees)} € · Sorties : -{fmt(a.sorties)} €
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 16, color: a.solde >= 0 ? 'var(--ok)' : 'var(--err)' }}>{fmt(a.solde)} €</strong>
                    <button className="btn ghost small" onClick={() => del(a.id)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {accounts.length >= 2 && (
        <div className="card">
          <h3>Transfert entre comptes</h3>
          <p style={{ margin: '4px 0 10px', color: 'var(--txt-soft)', fontSize: 13 }}>
            Crée automatiquement une sortie sur le compte source et une entrée sur le compte destination (catégorie <i>transfert</i>, exclue des stats).
          </p>
          <form className="form" onSubmit={doTransfer}>
            <div className="row3">
              <select className="select" value={transfer.from_id} onChange={e => setTransfer({ ...transfer, from_id: e.target.value })} required>
                <option value="">Depuis…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
              <select className="select" value={transfer.to_id} onChange={e => setTransfer({ ...transfer, to_id: e.target.value })} required>
                <option value="">Vers…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
              <input className="input" type="number" step="0.01" placeholder="Montant (€)"
                     value={transfer.montant} onChange={e => setTransfer({ ...transfer, montant: e.target.value })} required />
            </div>
            <input className="input" placeholder="Note (optionnel)"
                   value={transfer.note} onChange={e => setTransfer({ ...transfer, note: e.target.value })} />
            <button className="btn" type="submit">Transférer</button>
            {err && <div style={{ color: 'var(--err)', fontSize: 13 }}>{err}</div>}
          </form>
        </div>
      )}
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
