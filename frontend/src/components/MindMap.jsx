import { useMemo, useState } from 'react';

const CAT_COLORS = {
  objectif:    '#4ade80',
  etape:       '#60a5fa',
  risque:      '#f87171',
  ressource:   '#a78bfa',
  idee:        '#fbbf24',
  opportunite: '#34d399',
};

export default function MindMap({ mindmap, onRefresh, loading }) {
  const [hover, setHover] = useState(null);
  const width = 900, height = 600;
  const cx = width / 2, cy = height / 2;

  const layout = useMemo(() => buildLayout(mindmap, cx, cy), [mindmap, cx, cy]);

  if (!mindmap) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 30 }}>
        <div style={{ color: 'var(--txt-soft)', marginBottom: 14 }}>
          Aucune carte mentale pour ce projet. Laisse l'IA brainstormer des idées à partir de la description et des tâches.
        </div>
        <button className="btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'L\'IA réfléchit…' : '🧠 Lancer le brainstorm IA'}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>Carte mentale IA</h3>
          {mindmap.resume && <p style={{ margin: '6px 0 0', color: 'var(--txt-dim)', fontSize: 13 }}>{mindmap.resume}</p>}
          {mindmap.generatedAt && (
            <div style={{ fontSize: 11, color: 'var(--txt-soft)', marginTop: 4 }}>
              Générée le {new Date(mindmap.generatedAt).toLocaleString('fr-FR')}
            </div>
          )}
        </div>
        <button className="btn ghost small" onClick={onRefresh} disabled={loading}>
          {loading ? 'Régénération…' : '🔄 Regénérer'}
        </button>
      </div>

      <div style={{ overflow: 'auto', background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--line-soft)' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 600, display: 'block' }}>
          {layout.branches.map((b, i) => (
            <g key={i}>
              <path d={b.path} stroke={b.color} strokeWidth="2" fill="none" opacity="0.55" />
              {b.children.map((c, j) => (
                <path key={j} d={c.path} stroke={b.color} strokeWidth="1.2" fill="none" opacity="0.35" />
              ))}
            </g>
          ))}

          {layout.branches.map((b, i) => (
            <g key={`c-${i}`}>
              {b.children.map((c, j) => (
                <g key={j}
                   onMouseEnter={() => setHover({ i, j, note: c.note })}
                   onMouseLeave={() => setHover(null)}
                   style={{ cursor: c.note ? 'help' : 'default' }}>
                  <rect x={c.x - c.w / 2} y={c.y - 13} width={c.w} height="26" rx="13"
                        fill="var(--bg-1)" stroke={b.color} strokeWidth="1.2" />
                  <text x={c.x} y={c.y + 4} textAnchor="middle" fill="var(--txt)" fontSize="11" style={{ pointerEvents: 'none' }}>
                    {c.title}
                  </text>
                </g>
              ))}
            </g>
          ))}

          {layout.branches.map((b, i) => (
            <g key={`b-${i}`}>
              <rect x={b.x - b.w / 2} y={b.y - 16} width={b.w} height="32" rx="16"
                    fill={b.color} opacity="0.18" stroke={b.color} strokeWidth="1.5" />
              <text x={b.x} y={b.y + 5} textAnchor="middle" fill="var(--txt)" fontSize="13" fontWeight="600" style={{ pointerEvents: 'none' }}>
                {b.title}
              </text>
              <text x={b.x} y={b.y + 22} textAnchor="middle" fill={b.color} fontSize="9" style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: 1 }}>
                {b.categorie}
              </text>
            </g>
          ))}

          <g>
            <circle cx={cx} cy={cy} r="55" fill="var(--accent)" opacity="0.22" />
            <circle cx={cx} cy={cy} r="55" fill="none" stroke="var(--accent)" strokeWidth="2" />
            <text x={cx} y={cy + 5} textAnchor="middle" fill="var(--txt)" fontSize="14" fontWeight="700">
              {truncate(layout.racine, 18)}
            </text>
          </g>

          {hover?.note && (
            <g>
              <rect x={10} y={height - 60} width={width - 20} height="50" rx="8"
                    fill="var(--bg-1)" stroke="var(--line)" opacity="0.98" />
              <text x={20} y={height - 38} fill="var(--txt-dim)" fontSize="12">
                {truncate(hover.note, 130)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 11 }}>
        {Object.entries(CAT_COLORS).map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--txt-soft)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildLayout(mindmap, cx, cy) {
  if (!mindmap?.branches?.length) return { racine: mindmap?.racine || '', branches: [] };
  const n = mindmap.branches.length;
  const R = 210;
  const R2 = 330;

  const branches = mindmap.branches.map((b, i) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * i) / n;
    const bx = cx + R * Math.cos(angle);
    const by = cy + R * Math.sin(angle);
    const color = CAT_COLORS[b.categorie] || CAT_COLORS.idee;
    const path = curvePath(cx, cy, bx, by);

    const kids = b.enfants || [];
    const kn = kids.length || 1;
    const spread = Math.PI / 3.2;
    const children = kids.map((c, j) => {
      const off = kn === 1 ? 0 : (j / (kn - 1) - 0.5) * spread;
      const a2 = angle + off;
      const x = cx + R2 * Math.cos(a2);
      const y = cy + R2 * Math.sin(a2);
      const w = Math.max(80, c.titre.length * 6 + 16);
      return { title: truncate(c.titre, 30), note: c.note, x, y, w, path: curvePath(bx, by, x, y) };
    });

    return {
      title: truncate(b.titre, 20),
      categorie: b.categorie,
      color,
      x: bx, y: by,
      w: Math.max(110, b.titre.length * 7 + 20),
      path,
      children,
    };
  });
  return { racine: mindmap.racine, branches };
}

function curvePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
