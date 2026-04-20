export function StatCard({ title, value, hint, accent = false }) {
  return (
    <div className="card fade-in">
      <h3>{title}</h3>
      <div className="big" style={{ color: accent ? 'var(--accent)' : undefined }}>{value}</div>
      {hint && <div className="delta">{hint}</div>}
    </div>
  );
}

export function ScoreCard({ title, score, hint }) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="card fade-in">
      <h3>{title}</h3>
      <div className="big">{s}<span style={{ color: 'var(--txt-soft)', fontSize: 14, fontWeight: 400 }}> / 100</span></div>
      <div className="meter"><span style={{ width: `${s}%` }} /></div>
      {hint && <div className="delta" style={{ marginTop: 10 }}>{hint}</div>}
    </div>
  );
}
