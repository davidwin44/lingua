import { NavLink, Outlet, Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/study', label: 'Study', icon: 'cards' },
  { to: '/grammar', label: 'Grammar', icon: 'grammar' },
  { to: '/library', label: 'Read', icon: 'book' },
  { to: '/speak', label: 'Speak', icon: 'speak' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
          <Icon name={n.icon} size={22} />
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { pack, saveFailed } = useApp();
  return (
    <div className="app">
      <header className="top-bar">
        <Link to="/" className="brand" aria-label="Lingua home">
          <span className="brand-name">Lingua</span>
          <span className="brand-lang">{pack.meta.name}</span>
        </Link>
        <BottomNav />
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          <Icon name="settings" size={22} />
        </Link>
      </header>
      {saveFailed ? (
        <p className="save-warning" role="status">
          Progress can’t be saved in this browser (storage is blocked or full). Export a backup from Settings.
        </p>
      ) : null}
      <main className="main" id="main">
        <Outlet />
      </main>
    </div>
  );
}
