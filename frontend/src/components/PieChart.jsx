/**
 * Pie chart SVG : répartition par catégorie.
 * data: [{ label, value, color? }]
 */
const PALETTE = [
  '#7c5cff', '#22d3ee', '#f59e0b', '#ef4444', '#10b981',
  '#ec4899', '#3b82f6', '#84cc16', '#f97316', '#a855f7',
  '#14b8a6', '#eab308',
];

export function PieChart({ data = [], size = 220, title }) {
  const items = (data || []).filter(d => (d.value || 0) > 0);
  const total = items.reduce((s, d) => s + (d.value || 0), 0);
  if (!items.length || total <= 0) return <div className="empty">Pas de données à visualiser.</div>;

  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let acc = 0;
  const paths = items.map((d, i) => {
    const frac = d.value / total;
    const start = acc;
    const end = acc + frac;
    acc = end;
    const color = d.color || PALETTE[i % PALETTE.length];
    if (frac >= 0.999) {
      return (
        <circle key={i} cx={cx} cy={cy} r={r} fill={color}>
          <title>{d.label} : {fmt(d.value)} € (100%)</title>
        </circle>
      );
    }
    const a1 = start * 2 * Math.PI - Math.PI / 2;
    const a2 = end * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return (
      <path key={i} d={path} fill={color} stroke="var(--bg-1, #0a0a0c)" strokeWidth="1">
        <title>{d.label} : {fmt(d.value)} € ({Math.round(frac * 100)}%)</title>
      </path>
    );
  });

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
        {paths}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--bg-1, #0a0a0c)" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="var(--txt-soft)">Total</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--txt)">
          {fmt(total)} €
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 180 }}>
        {title && <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {items.map((d, i) => {
            const pct = Math.round((d.value / total) * 100);
            const color = d.color || PALETTE[i % PALETTE.length];
            return (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--txt)' }}>{d.label}</span>
                <span style={{ color: 'var(--txt-soft)' }}>{fmt(d.value)} €</span>
                <span style={{ color: 'var(--txt-dim)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }); }
