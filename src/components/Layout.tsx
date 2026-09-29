import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { weeklyProgress } from '../lib/progress';
import { buildReviewQueue } from '../lib/scheduler';
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

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'is-active' : ''}`;

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

/**
 * The week so far, kept in view on wide screens. It measures the weekly goal, never a daily
 * run, so a missed day costs nothing here.
 */
function WeekCard() {
  const { progress } = useApp();
  const now = useNow(60_000);
  const week = weeklyProgress(progress, now);
  const due = buildReviewQueue(progress, now).ids.length;
  const unit = progress.goal?.unit ?? 'minutes';
  return (
    <section className="side-card" aria-labelledby="side-week">
      <p id="side-week" className="side-card-label">
        This week
      </p>
      <p className="side-card-value">
        <strong>{week.value}</strong> of {week.target} {unit}
      </p>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.round(week.fraction * 100)}%` }} />
      </div>
      <Link to={due > 0 ? '/review' : '/study'} className="btn btn-primary btn-sm btn-block">
        {due > 0 ? `Review ${due} due` : 'Open study'}
      </Link>
    </section>
  );
}

export function Layout() {
  const { pack, saveFailed } = useApp();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-top">
          <Link to="/" className="brand" aria-label="Lingua home">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span className="brand-name">Lingua</span>
            <span className="brand-lang">{pack.meta.name}</span>
          </Link>
          <Link to="/settings" className="icon-btn side-settings-btn" aria-label="Settings">
            <Icon name="settings" size={22} />
          </Link>
        </div>
        <BottomNav />
        <nav className="side-more" aria-label="More">
          <NavLink to="/settings" className={navClass}>
            <Icon name="settings" size={20} />
            <span>Settings</span>
          </NavLink>
        </nav>
        <WeekCard />
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
