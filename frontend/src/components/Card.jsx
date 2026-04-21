import { Link } from 'react-router-dom';

function CardShell({ to, children, className = 'card fade-in' }) {
  if (!to) return <div className={className}>{children}</div>;
  return (
    <Link to={to} className={`${className} card-link`}>
      {children}
      <span className="card-link-arrow" aria-hidden>→</span>
    </Link>
  );
}

export function StatCard({ title, value, hint, accent = false, to }) {
  return (
    <CardShell to={to}>
      <h3>{title}</h3>
      <div className="big" style={{ color: accent ? 'var(--accent)' : undefined }}>{value}</div>
      {hint && <div className="delta">{hint}</div>}
    </CardShell>
  );
}

export function ScoreCard({ title, score, hint, to }) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <CardShell to={to}>
      <h3>{title}</h3>
      <div className="big">{s}<span style={{ color: 'var(--txt-soft)', fontSize: 14, fontWeight: 400 }}> / 100</span></div>
      <div className="meter"><span style={{ width: `${s}%` }} /></div>
      {hint && <div className="delta" style={{ marginTop: 10 }}>{hint}</div>}
    </CardShell>
  );
}
