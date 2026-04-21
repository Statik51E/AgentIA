import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const items = [
  { to: '/',         label: 'Dashboard' },
  { to: '/finances', label: 'Finances' },
  { to: '/projets',  label: 'Projets' },
  { to: '/idees',    label: 'Idées' },
  { to: '/ia',       label: 'CORE IA' },
  { to: '/settings', label: 'Paramètres' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <aside className="sidebar">
      <div className="brand">
        <img
          src={`${import.meta.env.BASE_URL}icons/agia.png`}
          alt="AgIa"
          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
        />
        <div>
          <div className="brand-name">AgIa</div>
          <div className="brand-sub">gestion intelligente</div>
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

      <div className="sidebar-footer">
        <div style={{ fontSize: 11, color: 'var(--txt-soft)', wordBreak: 'break-all' }}>
          {user?.email || user?.displayName || 'Connecté'}
        </div>
        <button className="btn ghost small" onClick={logout}>Se déconnecter</button>
      </div>
    </aside>
  );
}
