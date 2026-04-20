import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { BarChart } from '../../components/BarChart.jsx';

export default function Evolution() {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState([]);

  useEffect(() => { api.finances.history(months).then(setData); }, [months]);

  if (!data.length) return <div className="empty">Chargement…</div>;

  const totR = data.reduce((s, d) => s + (d.revenus  || 0), 0);
  const totD = data.reduce((s, d) => s + (d.depenses || 0), 0);
  const avgR = totR / data.length;
  const avgD = totD / data.length;
  const best = [...data].sort((a, b) => b.solde - a.solde)[0];
  const worst = [...data].sort((a, b) => a.solde - b.solde)[0];

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card"><h3>Revenu moyen</h3><div className="big" style={{ color: 'var(--ok)' }}>{fmt(avgR)} €</div><div className="delta">sur {data.length} mois</div></div>
        <div className="card"><h3>Dépense moyenne</h3><div className="big" style={{ color: 'var(--err)' }}>{fmt(avgD)} €</div></div>
        <div className="card"><h3>Meilleur mois</h3><div className="big">{best.label}</div><div className="delta">+{fmt(best.solde)} €</div></div>
        <div className="card"><h3>Pire mois</h3><div className="big">{worst.label}</div><div className="delta" style={{ color: 'var(--err)' }}>{fmt(worst.solde)} €</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Évolution mensuelle</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {[3, 6, 12].map(n => (
              <button key={n} className={`btn ${months === n ? '' : 'ghost'} small`} onClick={() => setMonths(n)}>{n} mois</button>
            ))}
          </div>
        </div>
        <BarChart data={data} height={260} />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--txt-soft)' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--ok)', borderRadius: 2, marginRight: 4 }} /> Revenus
          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--err)', borderRadius: 2, margin: '0 4px 0 12px' }} /> Dépenses
        </div>
      </div>

      <div className="card">
        <h3>Détail mois par mois</h3>
        <div className="list">
          {[...data].reverse().map(d => (
            <div key={d.mois} className="row">
              <div>
                <div className="title">{d.label}</div>
                <div className="meta">{d.nb} opération{d.nb > 1 ? 's' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ color: 'var(--ok)' }}>+{fmt(d.revenus)} €</span>
                <span style={{ color: 'var(--err)' }}>-{fmt(d.depenses)} €</span>
                <strong style={{ color: d.solde >= 0 ? 'var(--ok)' : 'var(--err)' }}>
                  {d.solde >= 0 ? '+' : ''}{fmt(d.solde)} €
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }); }
