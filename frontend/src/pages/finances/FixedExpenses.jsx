import { useMemo, useState } from 'react';
import { api } from '../../lib/api.js';

const EMPTY_FORM = { libelle: '', montant: '', categorie: '', jour_mois: '', type: 'depense' };

export default function FixedExpenses({ fixed, onChanged }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [filterCat, setFilterCat] = useState('all');
  const [filterType, setFilterType] = useState('all'); // all | revenu | depense
  const [search, setSearch] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const montant = parseFloat(form.montant);
    if (!form.libelle || !montant || montant <= 0) return;
    const payload = {
      libelle: form.libelle,
      montant,
      categorie: form.categorie ? form.categorie.trim().toLowerCase() : null,
      jour_mois: form.jour_mois ? parseInt(form.jour_mois, 10) : null,
      type: form.type === 'revenu' ? 'revenu' : 'depense',
    };
    if (editing) await api.finances.patchFixed(editing, payload);
    else await api.finances.addFixed(payload);
    setForm(EMPTY_FORM);
    setEditing(null);
    onChanged?.();
  };
  const startEdit = (f) => {
    setEditing(f.id);
    setForm({
      libelle: f.libelle || '',
      montant: f.montant != null ? String(f.montant) : '',
      categorie: f.categorie || '',
      jour_mois: f.jour_mois != null ? String(f.jour_mois) : '',
      type: f.type === 'revenu' ? 'revenu' : 'depense',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditing(null); setForm(EMPTY_FORM); };
  const del = async (id) => { await api.finances.delFixed(id); if (editing === id) cancelEdit(); onChanged?.(); };
  const toggle = async (f) => { await api.finances.patchFixed(f.id, { actif: !f.actif }); onChanged?.(); };

  const isRev = (f) => f.type === 'revenu';
  const totalDepenseActif = fixed.filter(f => f.actif && !isRev(f)).reduce((s, f) => s + f.montant, 0);
  const totalRevenuActif  = fixed.filter(f => f.actif &&  isRev(f)).reduce((s, f) => s + f.montant, 0);

  const categories = useMemo(() => {
    const map = new Map();
    for (const f of fixed) {
      if (isRev(f)) continue; // catégories = dépenses seulement
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
      if (filterType === 'revenu' && !isRev(f)) return false;
      if (filterType === 'depense' && isRev(f)) return false;
      const cat = (f.categorie || 'sans catégorie').toLowerCase();
      if (filterCat !== 'all' && cat !== filterCat) return false;
      if (s && !(`${f.libelle} ${f.categorie || ''}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [fixed, filterCat, filterType, search]);

  const filteredTotalActif = filtered.filter(f => f.actif).reduce((s, f) => s + f.montant, 0);
  const filteredTotal = filtered.reduce((s, f) => s + f.montant, 0);
  const activeFilterLabel = filterCat === 'all' ? 'Toutes catégories' : filterCat;

  const isRevenuForm = form.type === 'revenu';

  return (
    <>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card fade-in">
          <h3>Revenus fixes actifs</h3>
          <div className="big" style={{ color: 'var(--ok)' }}>+{fmt(totalRevenuActif)} €</div>
          <div className="delta">par mois · {fixed.filter(f => f.actif && isRev(f)).length} actifs</div>
        </div>
        <div className="card fade-in">
          <h3>Charges fixes actives</h3>
          <div className="big" style={{ color: 'var(--err)' }}>-{fmt(totalDepenseActif)} €</div>
          <div className="delta">par mois · {fixed.filter(f => f.actif && !isRev(f)).length} actives</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>{editing ? (isRevenuForm ? 'Modifier le revenu fixe' : 'Modifier la charge fixe') : (isRevenuForm ? 'Nouveau revenu fixe' : 'Nouvelle charge fixe')}</h3>
            {editing && <button type="button" className="btn ghost small" onClick={cancelEdit}>Annuler</button>}
          </div>
          <form className="form" onSubmit={submit}>
            <div className="row2">
              <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="depense">Charge (dépense)</option>
                <option value="revenu">Revenu (salaire…)</option>
              </select>
              <input className="input" placeholder={isRevenuForm ? 'Libellé (Salaire, Pension…)' : 'Libellé (Loyer, Netflix…)'}
                     value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} required />
            </div>
            <div className="row2">
              <input className="input" type="number" step="0.01" placeholder="Montant (€)"
                     value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} required />
              <input className="input" type="number" min="1" max="31" placeholder="Jour du mois (1-31)"
                     value={form.jour_mois} onChange={e => setForm({ ...form, jour_mois: e.target.value })} />
            </div>
            {!isRevenuForm && (
              <input className="input" placeholder="Catégorie (crédit, loyer, abonnement…)"
                     list="fixed-cats"
                     value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} />
            )}
            <datalist id="fixed-cats">
              {categories.map(c => <option key={c.key} value={c.key} />)}
            </datalist>
            <button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>
          </form>
        </div>
      </div>

      <div className="card fade-in" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <TypeChip label={`Tout · ${fixed.filter(f => f.actif).length}`} active={filterType === 'all'} onClick={() => setFilterType('all')} />
          <TypeChip label={`Revenus · ${fixed.filter(f => f.actif && isRev(f)).length}`} active={filterType === 'revenu'} onClick={() => setFilterType('revenu')} tone="ok" />
          <TypeChip label={`Charges · ${fixed.filter(f => f.actif && !isRev(f)).length}`} active={filterType === 'depense'} onClick={() => setFilterType('depense')} tone="err" />
        </div>
        {filterType !== 'revenu' && categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <CategoryChip label={`Toutes · ${fmt(totalDepenseActif)} €`} active={filterCat === 'all'} onClick={() => setFilterCat('all')} />
            {categories.map(c => (
              <CategoryChip key={c.key} label={`${c.key} · ${fmt(c.totalActif)} € (${c.actifs})`}
                            active={filterCat === c.key} onClick={() => setFilterCat(c.key)} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>
            {activeFilterLabel} — {filtered.length} {filtered.length > 1 ? 'lignes' : 'ligne'}
          </h3>
          <input className="input" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 220 }} />
        </div>

        {filterCat !== 'all' && filterType !== 'revenu' && (
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
          {filtered.length === 0 && <div className="empty">Aucune ligne dans cette sélection.</div>}
          {filtered.map(f => {
            const isEditing = editing === f.id;
            const rev = isRev(f);
            return (
              <div key={f.id} className="row"
                   style={{ opacity: f.actif ? 1 : 0.5, borderColor: isEditing ? 'var(--accent)' : undefined }}>
                <div>
                  <div className="title">
                    <span className={`badge ${rev ? 'ok' : 'err'}`}>{rev ? 'revenu' : 'charge'}</span>{' '}
                    {f.libelle} — <span style={{ color: rev ? 'var(--ok)' : 'var(--err)' }}>{rev ? '+' : '-'}{fmt(f.montant)} €</span>
                  </div>
                  <div className="meta">
                    {f.categorie && !rev && <span className="badge">{f.categorie}</span>}{' '}
                    {f.jour_mois && <span style={{ color: 'var(--txt-soft)' }}>le {f.jour_mois} du mois</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn ghost small" onClick={() => startEdit(f)}>Modifier</button>
                  <button className="btn ghost small" onClick={() => toggle(f)}>{f.actif ? 'Désactiver' : 'Activer'}</button>
                  <button className="btn ghost small" onClick={() => del(f.id)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CategoryChip({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className="btn"
            style={{
              padding: '6px 12px', fontSize: 13,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#000' : 'var(--txt)',
              border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
              borderRadius: 999,
            }}>{label}</button>
  );
}

function TypeChip({ label, active, onClick, tone }) {
  const bgActive = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : 'var(--accent)';
  return (
    <button type="button" onClick={onClick} className="btn"
            style={{
              padding: '6px 12px', fontSize: 13,
              background: active ? bgActive : 'transparent',
              color: active ? '#000' : 'var(--txt)',
              border: `1px solid ${active ? bgActive : 'var(--line)'}`,
              borderRadius: 999,
            }}>{label}</button>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
