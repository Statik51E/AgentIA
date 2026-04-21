import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

const DELAI_LABELS = {
  immediat: 'Immédiat',
  '1_semaine': 'Sous 1 semaine',
  '1_mois': 'Sous 1 mois',
  '3_mois': 'Sous 3 mois',
};
const EFFORT_LABELS = { faible: 'Facile', moyen: 'Moyen', eleve: 'Exigeant' };
const URGENCE_COLOR = { critique: 'var(--err)', elevee: 'var(--warn)', moderee: 'var(--accent)' };

export default function OverdraftPlan() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try { setPlan(await api.ai.overdraftPlan()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const solde = plan?.summary?.solde_apres_charges ?? null;
  const enDecouvert = typeof solde === 'number' && solde < 0;

  return (
    <>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card fade-in">
          <h3>Solde après charges fixes</h3>
          <div className="big" style={{ color: enDecouvert ? 'var(--err)' : 'var(--ok)' }}>
            {fmt(solde)} €
          </div>
          <div className="delta">
            {enDecouvert ? 'Tu es en découvert structurel.' : 'Situation à l\'équilibre ou positive.'}
          </div>
        </div>
        <div className="card fade-in">
          <h3>Revenus / dépenses (mois)</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Revenus</div>
              <div style={{ fontSize: 18, color: 'var(--ok)' }}>{fmt(plan?.stats?.revenuMois)} €</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Dépenses</div>
              <div style={{ fontSize: 18, color: 'var(--err)' }}>{fmt(plan?.stats?.depenseMois)} €</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Fixes</div>
              <div style={{ fontSize: 18 }}>{fmt(plan?.stats?.chargesFixes)} €</div>
            </div>
          </div>
        </div>
        <div className="card fade-in">
          <h3>Économie visée / mois</h3>
          <div className="big" style={{ color: 'var(--accent)' }}>{fmt(plan?.economie_mensuelle_cible)} €</div>
          <div className="delta">
            {plan?.urgence && (
              <span className="badge" style={{ background: URGENCE_COLOR[plan.urgence], color: '#000' }}>
                urgence {plan.urgence}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card fade-in" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Diagnostic IA</h3>
          <button className="btn ghost small" onClick={load} disabled={loading}>
            {loading ? 'IA en analyse…' : '↻ Recalculer'}
          </button>
        </div>
        <p style={{ color: 'var(--txt-dim)', lineHeight: 1.6, marginTop: 10 }}>
          {loading && !plan ? 'Analyse en cours…' : (plan?.diagnostic || 'Aucun diagnostic pour le moment.')}
        </p>
        {err && <div className="empty" style={{ color: 'var(--err)', marginTop: 10 }}>Erreur : {err}</div>}
        {plan?.error && <div className="empty" style={{ color: 'var(--err)', marginTop: 10 }}>IA indisponible : {plan.error}</div>}
      </div>

      {(plan?.etapes?.length || 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Plan d'action ({plan.etapes.length} étapes)</h3>
          <div className="list" style={{ marginTop: 10 }}>
            {plan.etapes.map((e) => (
              <div key={e.ordre} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <div>
                    <span style={{ color: 'var(--txt-dim)', fontSize: 12, marginRight: 6 }}>#{e.ordre}</span>
                    <span className="title">{e.titre}</span>
                  </div>
                  <strong style={{ color: 'var(--ok)' }}>-{fmt(e.economie_estimee)} €/mois</strong>
                </div>
                <div className="meta" style={{ color: 'var(--txt-soft)' }}>{e.pourquoi}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge">{e.categorie}</span>
                  <span className="badge acc">{DELAI_LABELS[e.delai] || e.delai}</span>
                  <span className="badge">{EFFORT_LABELS[e.effort] || e.effort}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(plan?.optimisations_long_terme?.length || 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Optimisations structurelles</h3>
          <ul style={{ color: 'var(--txt-dim)', lineHeight: 1.7, paddingLeft: 18, marginTop: 6 }}>
            {plan.optimisations_long_terme.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}

      {(plan?.risques?.length || 0) > 0 && (
        <div className="card">
          <h3>Risques à surveiller</h3>
          <ul style={{ color: 'var(--warn)', lineHeight: 1.7, paddingLeft: 18, marginTop: 6 }}>
            {plan.risques.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }); }
