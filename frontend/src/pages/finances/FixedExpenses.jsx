import { useMemo, useState } from 'react';
import { api } from '../../lib/api.js';

export default function FixedExpenses({ fixed, onChanged }) {
  const [form, setForm] = useState({ libelle: '', montant: '', categorie: '', jour_mois: '' });
  const [filterCat, setFilterCat] = useState('all');
  const [search, setSearch] = useState('');

  const add = async (e) => {
    e.preventDefault();
    const montant = parseFloat(form.montant);
    if (!form.libelle || !montant || montant <= 0) return;
    await api.finances.addFixed({
      libelle: form.libelle,
      montant,
      categorie: form.categorie ? form.categorie.trim().toLowerCase() : null,
      jour_mois: form.jour_mois ? parseInt(form.jour_mois, 10) : null,
    });
    setForm({ libelle: '', montant: '', categorie: '', jour_mois: '' });
    onChanged?.();
  };
  const del = async (id) => { await api.finances.delFixed(id); onChanged?.(); };
  const toggle = async (f) => { await api.finances.patchFixed(f.id, { actif: !f.actif }); onChanged?.(); };

  const totalActif = fixed.filter(f => f.actif).reduce((s, f) => s + f.montant, 0);

  const categories = useMemo(() => {
    const map = new Map();
    for (const f of fixed) {
      const k = (f.categorie || 'sans catégorie').toLowerCase();
      const e = map.get(k) || { key: k, total: 0, totalActif: 0, count: 0, actifs: 0 };
      e.total += f.montant || 0;
      e.count += 1;
      if (f.actif) { e.totalActif += f.montant || 0; e.actifs += 1; }
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => b.totalActif - a.totalActif);
  }, [fixed]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return fixed.filter(f => {
      const cat = (f.categorie || 'sans catégorie').toLowerCase();
      if (filterCat !== 'all' && cat !== filterCat) return false;
      if (s && !(`${f.libelle} ${f.categorie || ''}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [fixed, filterCat, search]);

  const filteredTotalActif = filtered.filter(f => f.actif).reduce((s, f) => s + f.montant, 0);
  const filteredTotal = filtered.reduce((s, f) => s + f.montant, 0);
  const activeFilterLabel = filterCat === 'all' ? 'Toutes catégories' : filterCat;

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
              <input className="input" placeholder="Catégorie (crédit, loyer, abonnement…)"
                     list="fixed-cats"
                     value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} />
              <input className="input" type="number" min="1" max="31" placeholder="Jour (1-31)"
                     value={form.jour_mois} onChange={e => setForm({ ...form, jour_mois: e.target.value })} />
            </div>
            <datalist id="fixed-cats">
              {categories.map(c => <option key={c.key} value={c.key} />)}
            </datalist>
            <button className="btn" type="submit">Ajouter</button>
          </form>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="card fade-in" style={{ marginBottom: 16 }}>
          <h3>Par catégorie</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <CategoryChip
              label={`Toutes · ${fmt(totalActif)} €`}
              active={filterCat === 'all'}
              onClick={() => setFilterCat('all')}
            />
            {categories.map(c => (
              <CategoryChip
                key={c.key}
                label={`${c.key} · ${fmt(c.totalActif)} € (${c.actifs})`}
                active={filterCat === c.key}
                onClick={() => setFilterCat(c.key)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>
            {activeFilterLabel} — {filtered.length} {filtered.length > 1 ? 'lignes' : 'ligne'}
          </h3>
          <input
            className="input"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>

        {filterCat !== 'all' && (
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="card" style={{ margin: 0 }}>
              <h3>Total actif ({activeFilterLabel})</h3>
              <div className="big" style={{ color: 'var(--err)' }}>{fmt(filteredTotalActif)} €</div>
              <div className="delta">par mois</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <h3>Total inclus inactifs</h3>
              <div className="big">{fmt(filteredTotal)} €</div>
              <div className="delta">{filtered.length} éléments</div>
            </div>
          </div>
        )}

        <div className="list" style={{ marginTop: 12 }}>
          {filtered.length === 0 && <div className="empty">Aucune charge dans cette sélection.</div>}
          {filtered.map(f => (
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

function CategoryChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn"
      style={{
        padding: '6px 12px',
        fontSize: 13,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#000' : 'var(--txt)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border, #2a2a2e)',
        borderRadius: 999,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
