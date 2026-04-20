/**
 * Bar chart SVG : revenus/dépenses par mois.
 * data: [{label, revenus, depenses, solde}]
 */
export function BarChart({ data = [], height = 220 }) {
  if (!data.length) return <div className="empty">Pas de données.</div>;
  const max = Math.max(1, ...data.flatMap(d => [d.revenus || 0, d.depenses || 0]));
  const barW = 18;
  const gap = 8;
  const groupW = barW * 2 + gap;
  const pad = { l: 40, r: 10, t: 10, b: 32 };
  const innerW = data.length * (groupW + 16);
  const W = innerW + pad.l + pad.r;
  const H = height;
  const usable = H - pad.t - pad.b;
  const y = (v) => pad.t + usable - (v / max) * usable;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* axes / grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line-soft)" strokeDasharray="2 3" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="var(--txt-soft)">
              {fmtK(max * f)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = pad.l + i * (groupW + 16) + 8;
          const hR = (d.revenus || 0) / max * usable;
          const hD = (d.depenses || 0) / max * usable;
          return (
            <g key={d.mois || i}>
              <rect x={gx}              y={y(d.revenus || 0)}  width={barW} height={hR} fill="var(--ok)"  rx="3">
                <title>{d.label} · Revenus : {fmt(d.revenus)} €</title>
              </rect>
              <rect x={gx + barW + gap} y={y(d.depenses || 0)} width={barW} height={hD} fill="var(--err)" rx="3">
                <title>{d.label} · Dépenses : {fmt(d.depenses)} €</title>
              </rect>
              <text x={gx + groupW / 2} y={H - 14} textAnchor="middle" fontSize="11" fill="var(--txt-soft)">{d.label}</text>
              <text x={gx + groupW / 2} y={H - 2} textAnchor="middle" fontSize="10"
                    fill={(d.solde || 0) >= 0 ? 'var(--ok)' : 'var(--err)'}>
                {d.solde >= 0 ? '+' : ''}{fmtK(d.solde)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }); }
function fmtK(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace('.0','') + 'k';
  return String(Math.round(v));
}
