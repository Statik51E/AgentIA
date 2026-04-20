import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

const CATS = ['loisir','restaurant','courses','transport','carburant','abonnement','santé','shopping','voyage','salaire','autre'];

export default function Transactions({ accounts, onChanged }) {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ type: '', categorie: '', accountId: '', q: '', from: '', to: '' });
  const [form, setForm] = useState({ type: 'depense', montant: '', categorie: '', note: '', account_id: '' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await api.finances.list(filters)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.type, filters.categorie, filters.accountId, filters.from, filters.to]);
  // recherche texte : debounce simple
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [filters.q]);

  const submit = async (e) => {
    e.preventDefault();
    const montant = parseFloat(form.montant);
    if (!montant || montant <= 0) return;
    const body = { type: form.type, montant, categorie: form.categorie || null, note: form.note || null, account_id: form.account_id || null };
    if (editing) await api.finances.patch(editing, body);
    else await api.finances.add(body);
    setForm({ type: form.type, montant: '', categorie: '', note: '', account_id: form.account_id });
    setEditing(null);
    load(); onChanged?.();
  };
  const del = async (id) => { await api.finances.del(id); load(); onChanged?.(); };
  const edit = (it) => {
    setEditing(it.id);
    setForm({
      type: it.type, montant: String(it.montant),
      categorie: it.categorie || '', note: it.note || '',
      account_id: it.account_id || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportCsv = async () => {
    const blob = await api.finances.exportCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const totalsShown = items.reduce((a, it) => {
    a[it.type] = (a[it.type] || 0) + it.montant; return a;
  }, {});

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{editing ? 'Modifier le mouvement' : 'Nouveau mouvement'}</h3>
          {editing && <button className="btn ghost small" onClick={() => { setEditing(null); setForm({ type: 'depense', montant: '', categorie: '', note: '', account_id: '' }); }}>Annuler</button>}
        </div>
        <form className="form" onSubmit={submit}>
          <div className="row3">
            <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="depense">Dépense</option>
              <option value="revenu">Revenu</option>
            </select>
            <input className="input" type="number" step="0.01" placeholder="Montant (€)"
                   value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} required />
            <select className="select" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">— Aucun compte —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>
          <div className="row2">
            <select className="select" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>
              <option value="">— Catégorie —</option>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="Note" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Filtres</h3>
          <button className="btn ghost small" onClick={exportCsv}>📥 Export CSV</button>
        </div>
        <div className="row3">
          <select className="select" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
            <option value="">Tous types</option>
            <option value="depense">Dépenses</option>
            <option value="revenu">Revenus</option>
          </select>
          <select className="select" value={filters.categorie} onChange={e => setFilters({ ...filters, categorie: e.target.value })}>
            <option value="">Toutes catégories</option>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" value={filters.accountId} onChange={e => setFilters({ ...filters, accountId: e.target.value })}>
            <option value="">Tous comptes</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
        <div className="row3" style={{ marginTop: 8 }}>
          <input className="input" type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
          <input className="input" type="date" value={filters.to}   onChange={e => setFilters({ ...filters, to: e.target.value })} />
          <input className="input" placeholder="Recherche (note, catégorie)" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{items.length} mouvement{items.length > 1 ? 's' : ''}</h3>
          <div style={{ fontSize: 13, color: 'var(--txt-soft)' }}>
            {totalsShown.revenu ? <span style={{ color: 'var(--ok)' }}>+{fmt(totalsShown.revenu)} €</span> : null}
            {totalsShown.revenu && totalsShown.depense ? ' · ' : ''}
            {totalsShown.depense ? <span style={{ color: 'var(--err)' }}>-{fmt(totalsShown.depense)} €</span> : null}
          </div>
        </div>
        <div className="list">
          {loading && <div className="empty">Chargement…</div>}
          {!loading && items.length === 0 && <div className="empty">Aucun mouvement.</div>}
          {items.map(it => {
            const acc = accounts.find(a => a.id === it.account_id);
            return (
              <div key={it.id} className="row">
                <div>
                  <div className="title">
                    <span className={`badge ${it.type === 'revenu' ? 'ok' : 'err'}`}>{it.type}</span>{' '}
                    {fmt(it.montant)} € {it.categorie && <span style={{ color: 'var(--txt-soft)' }}>· {it.categorie}</span>}
                    {acc && <span className="badge" style={{ marginLeft: 6 }}>{acc.nom}</span>}
                  </div>
                  <div className="meta">{formatDate(it.date)}{it.note ? ` — ${it.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost small" onClick={() => edit(it)}>Modifier</button>
                  <button className="btn ghost small" onClick={() => del(it.id)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
function formatDate(s) { try { return new Date(s).toLocaleString('fr-FR'); } catch { return s; } }
