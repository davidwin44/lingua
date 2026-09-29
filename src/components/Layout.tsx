import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { Icon, type IconName } from './Icon';

/** `also` lists the routes that belong to a section, so Learn and Review keep Study lit. */
const NAV: { to: string; label: string; icon: IconName; also?: string[] }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/study', label: 'Study', icon: 'cards', also: ['/learn', '/review'] },
  { to: '/grammar', label: 'Grammar', icon: 'grammar' },
  { to: '/library', label: 'Read', icon: 'book' },
  { to: '/speak', label: 'Speak', icon: 'speak', also: ['/produce', '/tutor', '/pronounce'] },
];

const within = (path: string, base: string) => path === base || path.startsWith(base + '/');

/** Primary navigation: a bottom tab bar on phones, the sidebar list on wide screens. */
export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((n) => {
        const active = n.to === '/' ? pathname === '/' : [n.to, ...(n.also ?? [])].some((b) => within(pathname, b));
        return (
          <Link key={n.to} to={n.to} className={`nav-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Layout() {
  const { pack, saveFailed } = useApp();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-top">
          <Link to="/" className="brand" aria-label="Lingua home">
            <span className="brand-name">Lingua</span>
            <span className="brand-lang">{pack.meta.name}</span>
          </Link>
          <Link to="/settings" className="icon-btn side-settings-btn" aria-label="Settings">
            <Icon name="settings" size={22} />
          </Link>
        </div>
        <BottomNav />
        <nav className="side-more" aria-label="More">
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
            <Icon name="settings" size={20} />
            <span>Settings</span>
          </NavLink>
        </nav>
      </aside>
      <div className="app-body">
        {saveFailed ? (
          <p className="save-warning" role="status">
            Progress can’t be saved in this browser (storage is blocked or full). Export a backup from Settings.
          </p>
        ) : null}
        <main className="main" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
