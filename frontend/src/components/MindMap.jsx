import { useEffect, useMemo, useRef, useState } from 'react';

const CAT_COLORS = {
  objectif:    '#4ade80',
  etape:       '#60a5fa',
  risque:      '#f87171',
  ressource:   '#a78bfa',
  idee:        '#fbbf24',
  opportunite: '#34d399',
};

const BASE_W = 900;
const BASE_H = 600;

// Colors resolved from theme.css :root — used to inline CSS vars for export.
const EXPORT_COLORS = {
  'var(--bg)':        '#0a0a0c',
  'var(--bg-1)':      '#101014',
  'var(--bg-2)':      '#15151b',
  'var(--bg-3)':      '#1c1c24',
  'var(--line)':      '#232330',
  'var(--line-soft)': '#1a1a22',
  'var(--txt)':       '#ececf1',
  'var(--txt-dim)':   '#a0a0ab',
  'var(--txt-soft)':  '#6c6c78',
  'var(--accent)':    '#7c5cff',
};

export default function MindMap({ mindmap, onRefresh, loading }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [downloading, setDownloading] = useState('');
  const inlineSvgRef = useRef(null);
  const fsSvgRef = useRef(null);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const fileBase = slugify(mindmap?.racine || 'carte-mentale');

  const pickSvg = () => fsSvgRef.current || inlineSvgRef.current;

  const downloadSvg = () => {
    const svg = pickSvg();
    if (!svg) return;
    setDownloading('svg');
    try {
      const source = serializeSvg(svg);
      triggerDownload(
        new Blob([source], { type: 'image/svg+xml;charset=utf-8' }),
        `${fileBase}.svg`,
      );
    } finally { setDownloading(''); }
  };

  const downloadPng = async () => {
    const svg = pickSvg();
    if (!svg) return;
    setDownloading('png');
    try {
      const source = serializeSvg(svg);
      const blob = await svgToPng(source, BASE_W * 2, BASE_H * 2);
      triggerDownload(blob, `${fileBase}.png`);
    } catch (e) {
      alert('Échec du téléchargement PNG : ' + e.message);
    } finally { setDownloading(''); }
  };

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

  const downloadButtons = (
    <>
      <button className="btn ghost small" onClick={downloadPng} disabled={!!downloading} title="Télécharger PNG">
        {downloading === 'png' ? '…' : '⬇ PNG'}
      </button>
      <button className="btn ghost small" onClick={downloadSvg} disabled={!!downloading} title="Télécharger SVG vectoriel">
        {downloading === 'svg' ? '…' : '⬇ SVG'}
      </button>
    </>
  );

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ margin: 0 }}>Carte mentale IA</h3>
            {mindmap.resume && <p style={{ margin: '6px 0 0', color: 'var(--txt-dim)', fontSize: 13 }}>{mindmap.resume}</p>}
            {mindmap.generatedAt && (
              <div style={{ fontSize: 11, color: 'var(--txt-soft)', marginTop: 4 }}>
                Générée le {new Date(mindmap.generatedAt).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn ghost small" onClick={() => setFullscreen(true)} title="Afficher en plein écran">
              ⛶ Plein écran
            </button>
            {downloadButtons}
            <button className="btn ghost small" onClick={onRefresh} disabled={loading}>
              {loading ? 'Régénération…' : '🔄 Regénérer'}
            </button>
          </div>
        </div>

        <MindMapSvg mindmap={mindmap} wrapperStyle={inlineWrapper} svgRef={inlineSvgRef} />

        <Legend />
      </div>

      {fullscreen && (
        <div className="modal-backdrop" onClick={() => setFullscreen(false)}>
          <div
            className="modal large"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Carte mentale en plein écran"
          >
            <div className="modal-header">
              <div style={{ minWidth: 0 }}>
                <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  🧠 {mindmap.racine || 'Carte mentale'}
                </h3>
                {mindmap.resume && (
                  <div style={{ color: 'var(--txt-soft)', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {mindmap.resume}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                {downloadButtons}
                <button className="btn ghost small" onClick={onRefresh} disabled={loading}>
                  {loading ? 'Régénération…' : '🔄 Regénérer'}
                </button>
                <button className="btn ghost small" onClick={() => setFullscreen(false)}>✕ Fermer</button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: 0, background: 'var(--bg-2)' }}>
              <MindMapSvg
                mindmap={mindmap}
                wrapperStyle={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--bg-2)' }}
                svgRef={fsSvgRef}
                fit
              />
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <Legend inline />
              <div style={{ color: 'var(--txt-soft)', fontSize: 11 }}>Échap pour fermer</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inlineWrapper = {
  background: 'var(--bg-2)',
  borderRadius: 10,
  border: '1px solid var(--line-soft)',
  width: '100%',
  aspectRatio: `${BASE_W} / ${BASE_H}`,
  overflow: 'hidden',
};

function Legend({ inline = false }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: inline ? 0 : 10, flexWrap: 'wrap', fontSize: 11 }}>
      {Object.entries(CAT_COLORS).map(([k, c]) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--txt-soft)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
          {k}
        </span>
      ))}
    </div>
  );
}

function MindMapSvg({ mindmap, wrapperStyle, svgRef, fit = false }) {
  const [hover, setHover] = useState(null);
  const cx = BASE_W / 2, cy = BASE_H / 2;
  const layout = useMemo(() => buildLayout(mindmap, cx, cy), [mindmap, cx, cy]);

  return (
    <div style={wrapperStyle}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BASE_W} ${BASE_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', touchAction: 'pinch-zoom' }}
      >
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
            <rect x={10} y={BASE_H - 60} width={BASE_W - 20} height="50" rx="8"
                  fill="var(--bg-1)" stroke="var(--line)" opacity="0.98" />
            <text x={20} y={BASE_H - 38} fill="var(--txt-dim)" fontSize="12">
              {truncate(hover.note, 130)}
            </text>
          </g>
        )}
      </svg>
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

// -------------------------------------------------------------------
// Export helpers (SVG + PNG)
// -------------------------------------------------------------------
function serializeSvg(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(BASE_W));
  clone.setAttribute('height', String(BASE_H));

  // Background rect for standalone files (dark theme bg)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', String(BASE_W));
  bg.setAttribute('height', String(BASE_H));
  bg.setAttribute('fill', EXPORT_COLORS['var(--bg)']);
  clone.insertBefore(bg, clone.firstChild);

  let source = new XMLSerializer().serializeToString(clone);
  for (const [k, v] of Object.entries(EXPORT_COLORS)) {
    source = source.split(k).join(v);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + source;
}

async function svgToPng(svgSource, width, height) {
  const blob = new Blob([svgSource], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Image SVG illisible'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = EXPORT_COLORS['var(--bg)'];
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob a échoué')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function slugify(s) {
  return String(s || 'carte-mentale')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'carte-mentale';
}
