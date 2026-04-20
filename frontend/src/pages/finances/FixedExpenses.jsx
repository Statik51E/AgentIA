import { useState } from 'react';
import { api } from '../../lib/api.js';

export default function FixedExpenses({ fixed, onChanged }) {
  const [form, setForm] = useState({ libelle: '', montant: '', categorie: '', jour_mois: '' });

  const add = async (e) => {
    e.preventDefault();
    const montant = parseFloat(form.montant);
    if (!form.libelle || !montant || montant <= 0) return;
    await api.finances.addFixed({
      libelle: form.libelle,
      montant,
      categorie: form.categorie || null,
      jour_mois: form.jour_mois ? parseInt(form.jour_mois, 10) : null,
    });
    setForm({ libelle: '', montant: '', categorie: '', jour_mois: '' });
    onChanged?.();
  };
  const del = async (id) => { await api.finances.delFixed(id); onChanged?.(); };
  const toggle = async (f) => { await api.finances.patchFixed(f.id, { actif: !f.actif }); onChanged?.(); };

  const totalActif = fixed.filter(f => f.actif).reduce((s, f) => s + f.montant, 0);

  return (
    <>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card fade-in">
          <h3>Total charges fixes actives</h3>
          <div className="big" style={{ color: 'var(--err)' }}>{fmt(totalActif)} €</div>
          <div className="delta">par mois · {fixed.filter(f => f.actif).length} actives</div>
        </div>
        <div className="card">
          <h3>Nouvelle charge fixe</h3>
          <form className="form" onSubmit={add}>
            <div className="row2">
              <input className="input" placeholder="Libellé (Loyer, Netflix…)"
                     value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} required />
              <input className="input" type="number" step="0.01" placeholder="Montant (€)"
                     value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} required />
            </div>
            <div className="row2">
              <input className="input" placeholder="Catégorie"
                     value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} />
              <input className="input" type="number" min="1" max="31" placeholder="Jour (1-31)"
                     value={form.jour_mois} onChange={e => setForm({ ...form, jour_mois: e.target.value })} />
            </div>
            <button className="btn" type="submit">Ajouter</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h3>Charges fixes ({fixed.length})</h3>
        <div className="list">
          {fixed.length === 0 && <div className="empty">Aucune charge fixe.</div>}
          {fixed.map(f => (
            <div key={f.id} className="row" style={{ opacity: f.actif ? 1 : 0.5 }}>
              <div>
                <div className="title">{f.libelle} — {fmt(f.montant)} €</div>
                <div className="meta">
                  {f.categorie && <span className="badge">{f.categorie}</span>}{' '}
                  {f.jour_mois && <span style={{ color: 'var(--txt-soft)' }}>le {f.jour_mois} du mois</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost small" onClick={() => toggle(f)}>{f.actif ? 'Désactiver' : 'Activer'}</button>
                <button className="btn ghost small" onClick={() => del(f.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
