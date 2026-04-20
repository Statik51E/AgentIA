import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const items = [
  { to: '/',         label: 'Dashboard' },
  { to: '/finances', label: 'Finances' },
  { to: '/projets',  label: 'Projets' },
  { to: '/idees',    label: 'Idées' },
  { to: '/ia',       label: 'CORE IA' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" />
        <div>
          <div className="brand-name">CORE IA</div>
          <div className="brand-sub">ULTIMATE</div>
        </div>
      </div>
      {items.map(it => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
        >
          <span className="dot" />
          <span>{it.label}</span>
        </NavLink>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--line)', display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--txt-soft)', wordBreak: 'break-all' }}>
          {user?.email || user?.displayName || 'Connecté'}
        </div>
        <button className="btn ghost small" onClick={logout}>Se déconnecter</button>
      </div>
    </aside>
  );
}
