import { StatCard } from '../../components/Card.jsx';
import { PieChart } from '../../components/PieChart.jsx';

const CATEGORIES_SUGGEREES = [
  'loisir','restaurant','courses','transport','carburant','abonnement','santé','shopping','voyage',
];

export default function Overview({ stats, summary, advice, loadingAdvice, onReloadAdvice, budgets, budgetForm, setBudgetForm, onAddBudget, onDelBudget }) {
  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard title="Revenus mois"   value={`${fmt(stats?.revenuMois)} €`} />
        <StatCard title="Dépensé mois"   value={`${fmt(stats?.depenseMois)} €`}
                  hint={stats?.isCurrent ? `Projection : ${fmt(stats.projectionMois)} €` : null} />
        <StatCard title="Charges fixes"  value={`${fmt(stats?.chargesFixes)} €`} hint="Déduites auto" />
        <StatCard title="Budget dispo"   value={`${fmt(stats?.budgetDisponible)} €`} accent
                  hint={`Solde global : ${fmt(summary?.solde_apres_charges)} €`} />
      </div>

      {advice && (
        <div className="card fade-in" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Conseils IA en temps réel</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {advice.verdict && <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>{advice.verdict}</span>}
              <button className="btn ghost small" onClick={onReloadAdvice} disabled={loadingAdvice}>
                {loadingAdvice ? 'IA…' : '↻'}
              </button>
            </div>
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
          Fixe une limite mensuelle par catégorie. L'IA alerte si tu dépasses.
        </p>
        <form className="form" onSubmit={onAddBudget}>
          <div className="row3">
            <input className="input" placeholder="Catégorie"
                   value={budgetForm.categorie} onChange={e => setBudgetForm({ ...budgetForm, categorie: e.target.value })} required />
            <input className="input" type="number" step="1" placeholder="Limite (€)"
                   value={budgetForm.limite_mensuelle} onChange={e => setBudgetForm({ ...budgetForm, limite_mensuelle: e.target.value })} required />
            <button className="btn" type="submit">Ajouter</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES_SUGGEREES.map(c => (
              <button type="button" key={c} className="btn ghost small"
                      onClick={() => setBudgetForm(b => ({ ...b, categorie: c }))}>{c}</button>
            ))}
          </div>
        </form>

        <div className="list" style={{ marginTop: 14 }}>
          {(stats?.perCategorie || []).length === 0 && <div className="empty">Aucune dépense ce mois.</div>}
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
                    <span style={{ color: 'var(--txt-soft)', fontSize: 12 }}>· {c.count || 0} op.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: over ? 'var(--err)' : 'var(--txt)' }}>
                      {fmt(c.depense)} €{limite ? ` / ${fmt(limite)} €` : ''}
                    </span>
                    {pct != null && <span className={`badge ${over ? 'err' : near ? 'warn' : 'ok'}`}>{pct}%</span>}
                    {budget && <button className="btn ghost small" onClick={() => onDelBudget(budget.id)}>✕</button>}
                  </div>
                </div>
                {limite && <div className="meter"><span style={{ width: `${pct}%`, background: barColor }} /></div>}
              </div>
            );
          })}
        </div>
      </div>

      {(stats?.totauxParCategorie?.length || 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Répartition des dépenses</h3>
          <p style={{ margin: '4px 0 14px', color: 'var(--txt-soft)', fontSize: 13 }}>
            Variable + charges fixes du mois, en %.
          </p>
          <PieChart
            data={stats.totauxParCategorie.map(t => ({ label: t.categorie, value: t.total }))}
            title={`${stats.totauxParCategorie.length} catégories`}
          />
        </div>
      )}

      {(stats?.totauxParCategorie?.length || 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Totaux par catégorie</h3>
          <p style={{ margin: '4px 0 10px', color: 'var(--txt-soft)', fontSize: 13 }}>
            Dépenses variables + charges fixes, cumulés.
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

      {(summary?.anomalies?.length || 0) > 0 && (
        <div className="card">
          <h3>Anomalies détectées</h3>
          <div className="list" style={{ marginTop: 10 }}>
            {summary.anomalies.map((a, i) => (
              <div key={i} className="row">
                <div><div className="title">{a.message}</div></div>
                <span className="badge warn">alerte</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
