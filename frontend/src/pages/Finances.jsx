import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import { StatCard } from '../components/Card.jsx';

const CATEGORIES_SUGGEREES = [
  { slug: 'loisir', label: 'Loisir' },
  { slug: 'restaurant', label: 'Restaurant' },
  { slug: 'courses', label: 'Courses' },
  { slug: 'transport', label: 'Transport' },
  { slug: 'carburant', label: 'Carburant' },
  { slug: 'abonnement', label: 'Abonnement' },
  { slug: 'santé', label: 'Santé' },
  { slug: 'shopping', label: 'Shopping' },
  { slug: 'voyage', label: 'Voyage' },
];

export default function Finances() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [fixed, setFixed] = useState([]);
  const [stats, setStats] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [advice, setAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const [form, setForm] = useState({ type: 'depense', montant: '', categorie: '', note: '' });
  const [fixedForm, setFixedForm] = useState({ libelle: '', montant: '', categorie: '', jour_mois: '' });
  const [budgetForm, setBudgetForm] = useState({ categorie: '', limite_mensuelle: '' });

  const [statement, setStatement] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [list, sum, fx, st, bg] = await Promise.all([
      api.finances.list(),
      api.finances.summary(),
      api.finances.listFixed(),
      api.finances.stats(),
      api.finances.listBudgets(),
    ]);
    setItems(list); setSummary(sum); setFixed(fx); setStats(st); setBudgets(bg);
  };
  const loadAdvice = async () => {
    setLoadingAdvice(true);
    try { setAdvice(await api.ai.advice()); }
    catch (e) { setErr(e.message); }
    finally { setLoadingAdvice(false); }
  };
  useEffect(() => { load(); loadAdvice(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const montant = parseFloat(form.montant);
    if (!montant || montant <= 0) return;
    await api.finances.add({ ...form, montant });
    setForm({ type: form.type, montant: '', categorie: '', note: '' });
    load();
  };
  const del = async (id) => { await api.finances.del(id); load(); };

  const addFixed = async (e) => {
    e.preventDefault();
    const montant = parseFloat(fixedForm.montant);
    if (!montant || montant <= 0 || !fixedForm.libelle) return;
    await api.finances.addFixed({
      libelle: fixedForm.libelle,
      montant,
      categorie: fixedForm.categorie || null,
      jour_mois: fixedForm.jour_mois ? parseInt(fixedForm.jour_mois, 10) : null,
    });
    setFixedForm({ libelle: '', montant: '', categorie: '', jour_mois: '' });
    load();
  };
  const delFixed = async (id) => { await api.finances.delFixed(id); load(); };
  const toggleFixed = async (f) => { await api.finances.patchFixed(f.id, { actif: !f.actif }); load(); };

  const addBudget = async (e) => {
    e.preventDefault();
    const limite = parseFloat(budgetForm.limite_mensuelle);
    const cat = budgetForm.categorie.trim().toLowerCase();
    if (!cat || !limite || limite <= 0) return;
    try { await api.finances.addBudget({ categorie: cat, limite_mensuelle: limite }); }
    catch (ex) { setErr(ex.message); }
    setBudgetForm({ categorie: '', limite_mensuelle: '' });
    load(); loadAdvice();
  };
  const delBudget = async (id) => { await api.finances.delBudget(id); load(); loadAdvice(); };

  const analyze = async () => {
    if (statement.trim().length < 20) return;
    setLoadingAI(true); setErr(''); setAnalysis(null);
    try { setAnalysis(await api.finances.analyzeStatement(statement)); }
    catch (e) { setErr(e.message); }
    finally { setLoadingAI(false); }
  };

  const analyzePDF = async (file) => {
    if (!file) return;
    setLoadingAI(true); setErr(''); setAnalysis(null); setStatement('');
    try { setAnalysis(await api.finances.analyzeStatementPDF(file)); }
    catch (e) { setErr(e.message); }
    finally { setLoadingAI(false); }
  };

  const importAll = async () => {
    if (!analysis) return;
    await api.finances.importStatement({
      transactions: analysis.transactions || [],
      depenses_fixes: analysis.depenses_fixes || [],
    });
    setAnalysis(null); setStatement('');
    load();
  };

  const importFixedOnly = async () => {
    if (!analysis?.depenses_fixes?.length) return;
    await api.finances.importStatement({
      transactions: [],
      depenses_fixes: analysis.depenses_fixes,
    });
    setAnalysis(null); setStatement('');
    load();
  };

  return (
    <>
      <TopBar
        title="Finances"
        sub={stats ? `Mois ${stats.mois} · J${stats.jour}/${stats.joursDansMois} · ${stats.joursRestants}j restants` : 'Revenus, dépenses, charges fixes, budgets'}
        right={<button className="btn ghost small" onClick={loadAdvice} disabled={loadingAdvice}>{loadingAdvice ? 'IA…' : 'Rafraîchir conseils'}</button>}
      />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard title="Revenus mois"   value={`${fmt(stats?.revenuMois)} €`} />
        <StatCard title="Dépensé mois"   value={`${fmt(stats?.depenseMois)} €`} hint={stats ? `Projection : ${fmt(stats.projectionMois)} €` : null} />
        <StatCard title="Charges fixes"  value={`${fmt(stats?.chargesFixes)} €`} hint="Déduites auto" />
        <StatCard title="Budget dispo"   value={`${fmt(stats?.budgetDisponible)} €`} accent hint={`Solde global : ${fmt(summary?.solde_apres_charges)} €`} />
      </div>

      {advice && (
        <div className="card fade-in" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Conseils IA en temps réel</h3>
            {advice.verdict && <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>{advice.verdict}</span>}
          </div>
          <div className="list">
            {(advice.conseils || []).length === 0 && <div className="empty">Aucun conseil.</div>}
            {(advice.conseils || []).map((c, i) => (
              <div key={i} className="row">
                <div style={{ flex: 1 }}>
                  <div className="title">{c.titre}</div>
                  <div className="meta" style={{ color: 'var(--txt-dim)', marginTop: 2 }}>{c.message}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className={`badge ${c.priorite === 'haute' ? 'err' : c.priorite === 'moyenne' ? 'warn' : 'acc'}`}>{c.priorite}</span>
                  <span className="badge">{c.categorie}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Budgets & dépenses du mois</h3>
        <p style={{ margin: '4px 0 10px', color: 'var(--txt-soft)', fontSize: 13 }}>
          Fixe une limite mensuelle par catégorie. L'IA suit tes dépenses en temps réel et alerte si tu dépasses.
        </p>

        <form className="form" onSubmit={addBudget}>
          <div className="row3">
            <input className="input" placeholder="Catégorie (loisir, restaurant…)"
                   value={budgetForm.categorie} onChange={e => setBudgetForm({ ...budgetForm, categorie: e.target.value })} required />
            <input className="input" type="number" step="1" placeholder="Limite mensuelle (€)"
                   value={budgetForm.limite_mensuelle} onChange={e => setBudgetForm({ ...budgetForm, limite_mensuelle: e.target.value })} required />
            <button className="btn" type="submit">Ajouter budget</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES_SUGGEREES.map(c => (
              <button type="button" key={c.slug} className="btn ghost small"
                      onClick={() => setBudgetForm(b => ({ ...b, categorie: c.slug }))}>
                {c.label}
              </button>
            ))}
          </div>
        </form>

        <div className="list" style={{ marginTop: 14 }}>
          {(stats?.perCategorie || []).length === 0 && <div className="empty">Aucune dépense ce mois. Ajoute-en ou importe un relevé.</div>}
          {(stats?.perCategorie || []).map(c => {
            const limite = c.limite;
            const pct = limite ? Math.min(100, Math.round(((c.depense || 0) / limite) * 100)) : null;
            const over = limite && (c.depense || 0) > limite;
            const near = pct != null && pct >= 80 && !over;
            const barColor = over ? 'var(--err)' : near ? 'var(--warn)' : 'var(--accent)';
            const budget = budgets.find(b => b.categorie === c.categorie);
            return (
              <div key={c.categorie} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <span className="title">{c.categorie}</span>{' '}
                    <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>· {c.count || 0} opération{(c.count || 0) > 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: over ? 'var(--err)' : 'var(--txt)' }}>
                      {fmt(c.depense)} €{limite ? ` / ${fmt(limite)} €` : ''}
                    </span>
                    {pct != null && <span className={`badge ${over ? 'err' : near ? 'warn' : 'ok'}`}>{pct}%</span>}
                    {budget && (
                      <button className="btn ghost small" onClick={() => delBudget(budget.id)} title="Supprimer le budget">✕</button>
                    )}
                  </div>
                </div>
                {limite && (
                  <div className="meter"><span style={{ width: `${pct}%`, background: barColor }} /></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(stats?.totauxParCategorie?.length || 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Totaux par catégorie</h3>
          <p style={{ margin: '4px 0 10px', color: 'var(--txt-soft)', fontSize: 13 }}>
            Dépenses variables du mois + charges fixes mensuelles, cumulés par catégorie.
          </p>
          <div className="list">
            {stats.totauxParCategorie.map(t => (
              <div key={t.categorie} className="row">
                <div>
                  <div className="title">{t.categorie}</div>
                  <div className="meta" style={{ color: 'var(--txt-soft)' }}>
                    {t.variable > 0 && <>Variable : {fmt(t.variable)} € ({t.nbVariable})</>}
                    {t.variable > 0 && t.fixe > 0 && ' · '}
                    {t.fixe > 0 && <>Fixe : {fmt(t.fixe)} € ({t.nbFixe})</>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {t.fixe > 0 && <span className="badge">fixe</span>}
                  {t.variable > 0 && <span className="badge acc">variable</span>}
                  <strong style={{ fontSize: 15 }}>{fmt(t.total)} €</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h3>Ajouter une entrée</h3>
          <form className="form" onSubmit={submit} style={{ marginTop: 10 }}>
            <div className="row2">
              <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="depense">Dépense</option>
                <option value="revenu">Revenu</option>
              </select>
              <input className="input" type="number" step="0.01" placeholder="Montant (€)"
                     value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} required />
            </div>
            <input className="input" placeholder="Catégorie (ex: courses, salaire)"
                   value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} />
            <input className="input" placeholder="Note (optionnel)"
                   value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            <button className="btn" type="submit">Ajouter</button>
          </form>
        </div>

        <div className="card">
          <h3>Anomalies détectées</h3>
          {(summary?.anomalies?.length || 0) === 0
            ? <div className="empty">Aucune anomalie.</div>
            : (
              <div className="list" style={{ marginTop: 10 }}>
                {summary.anomalies.map((a, i) => (
                  <div key={i} className="row"><div><div className="title">{a.message}</div></div><span className="badge warn">alerte</span></div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Analyser un relevé de compte</h3>
        <p style={{ margin: '4px 0 10px', color: 'var(--txt-soft)', fontSize: 13 }}>
          Uploade le PDF du relevé <b>OU</b> colle le texte. L'IA détecte les transactions et surtout les charges fixes récurrentes.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <label className="btn ghost" style={{ cursor: 'pointer' }}>
            {loadingAI ? 'Analyse…' : '📄 Importer un PDF'}
            <input
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              disabled={loadingAI}
              onChange={e => analyzePDF(e.target.files?.[0])}
            />
          </label>
          <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>ou colle le texte ci-dessous</span>
        </div>

        <textarea
          className="textarea"
          placeholder="Copie/colle ton relevé bancaire ici…"
          value={statement}
          onChange={e => setStatement(e.target.value)}
          style={{ minHeight: 100 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={analyze} disabled={loadingAI || statement.trim().length < 20}>
            {loadingAI ? 'Analyse IA…' : 'Analyser le texte'}
          </button>
          {analysis?.depenses_fixes?.length > 0 && (
            <button className="btn" onClick={importFixedOnly} style={{ background: 'var(--ok)' }}>
              Importer les {analysis.depenses_fixes.length} charges fixes
            </button>
          )}
          {analysis && (
            <button className="btn ghost" onClick={importAll}>
              Tout importer ({analysis.transactions?.length || 0} tx + {analysis.depenses_fixes?.length || 0} fixes)
            </button>
          )}
        </div>
        {err && <div className="empty" style={{ color: 'var(--err)' }}>Erreur : {err}</div>}

        {analysis && (
          <div className="fade-in" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            {analysis.resume && (
              <div style={{ color: 'var(--txt-dim)', lineHeight: 1.55 }}>{analysis.resume}</div>
            )}
            {analysis.transactions?.length > 0 && (
              <div>
                <h4 style={miniTitle}>Transactions détectées ({analysis.transactions.length})</h4>
                <div className="list">
                  {analysis.transactions.slice(0, 20).map((t, i) => (
                    <div key={i} className="row">
                      <div>
                        <div className="title">
                          <span className={`badge ${t.type === 'revenu' ? 'ok' : 'err'}`}>{t.type}</span>{' '}
                          {fmt(t.montant)} € {t.categorie && <span style={{ color: 'var(--txt-soft)' }}>· {t.categorie}</span>}
                        </div>
                        <div className="meta">{t.date} — {t.libelle}</div>
                      </div>
                    </div>
                  ))}
                  {analysis.transactions.length > 20 && (
                    <div className="empty">+ {analysis.transactions.length - 20} autres transactions</div>
                  )}
                </div>
              </div>
            )}
            {analysis.depenses_fixes?.length > 0 && (
              <div>
                <h4 style={miniTitle}>Charges fixes détectées ({analysis.depenses_fixes.length})</h4>
                <div className="list">
                  {analysis.depenses_fixes.map((f, i) => (
                    <div key={i} className="row">
                      <div>
                        <div className="title">{f.libelle} — {fmt(f.montant)} €</div>
                        <div className="meta">{f.categorie || '—'}{f.jour_mois ? ` · le ${f.jour_mois}` : ''}</div>
                      </div>
                      <span className="badge acc">récurrent</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Charges fixes mensuelles ({fixed.length})</h3>
        <form className="form" onSubmit={addFixed} style={{ marginTop: 10 }}>
          <div className="row3">
            <input className="input" placeholder="Libellé (loyer, Netflix…)"
                   value={fixedForm.libelle} onChange={e => setFixedForm({ ...fixedForm, libelle: e.target.value })} required />
            <input className="input" type="number" step="0.01" placeholder="Montant (€)"
                   value={fixedForm.montant} onChange={e => setFixedForm({ ...fixedForm, montant: e.target.value })} required />
            <input className="input" placeholder="Catégorie"
                   value={fixedForm.categorie} onChange={e => setFixedForm({ ...fixedForm, categorie: e.target.value })} />
          </div>
          <div className="row2">
            <input className="input" type="number" min="1" max="31" placeholder="Jour du mois (1-31)"
                   value={fixedForm.jour_mois} onChange={e => setFixedForm({ ...fixedForm, jour_mois: e.target.value })} />
            <button className="btn" type="submit">Ajouter charge fixe</button>
          </div>
        </form>

        <div className="list" style={{ marginTop: 14 }}>
          {fixed.length === 0 && <div className="empty">Aucune charge fixe. Ajoute-en une ou importe depuis un relevé.</div>}
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
                <button className="btn ghost small" onClick={() => toggleFixed(f)}>{f.actif ? 'Désactiver' : 'Activer'}</button>
                <button className="btn ghost small" onClick={() => delFixed(f.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={miniTitle}>Mouvements récents</h3>
        <div className="list">
          {items.length === 0 && <div className="empty">Aucun mouvement pour le moment.</div>}
          {items.map(it => (
            <div key={it.id} className="row">
              <div>
                <div className="title">
                  <span className={`badge ${it.type === 'revenu' ? 'ok' : 'err'}`}>{it.type}</span>{' '}
                  {fmt(it.montant)} € {it.categorie && <span style={{ color: 'var(--txt-soft)' }}>· {it.categorie}</span>}
                </div>
                <div className="meta">{formatDate(it.date)}{it.note ? ` — ${it.note}` : ''}</div>
              </div>
              <button className="btn ghost small" onClick={() => del(it.id)}>Supprimer</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const miniTitle = { margin: '0 0 10px', color: 'var(--txt-dim)', textTransform: 'uppercase', fontSize: 12, letterSpacing: .6 };
function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
function formatDate(s) { try { return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('fr-FR'); } catch { return s; } }
