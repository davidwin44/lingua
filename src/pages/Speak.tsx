import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { pronSessionsThisWeek } from '../lib/progress';
import { srSupported } from '../lib/speech';
import { Icon } from '../components/Icon';

/**
 * Output practice hub. Principle 9: speaking and writing with explicit feedback is where
 * current apps are weakest, so every activity here gives targeted feedback.
 */
export function Speak() {
  const { pack, progress } = useApp();
  const now = useNow(60_000);
  const done = Object.keys(progress.productionDone).length;
  const hasKey = Boolean(progress.settings.apiKey.trim());

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Speaking and writing</h1>
          <p className="muted">Every activity here gives feedback you can act on. Pronunciation never changes your review grades.</p>
        </div>
      </header>
      <ul className="card-list">
        <li>
          <Link to="/produce" className="card-row">
            <span className="icon-tile" aria-hidden="true">
              <Icon name="pen" size={18} />
            </span>
            <span className="card-row-main">
              <span className="card-row-title">Sentence building</span>
              <span className="card-row-sub">Put short English sentences into {pack.meta.name}. Works offline.</span>
            </span>
            <span className="badge">
              {done}/{pack.production.length}
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link to="/tutor" className="card-row">
            <span className="icon-tile" aria-hidden="true">
              <Icon name="speak" size={18} />
            </span>
            <span className="card-row-main">
              <span className="card-row-title">Role-play</span>
              <span className="card-row-sub">A café, a hotel, asking the way. With corrections from Claude.</span>
            </span>
            {hasKey ? null : <span className="badge">needs API key</span>}
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link to="/pronounce" className="card-row">
            <span className="icon-tile" aria-hidden="true">
              <Icon name="mic" size={18} />
            </span>
            <span className="card-row-main">
              <span className="card-row-title">Pronunciation</span>
              <span className="card-row-sub">Minimal pairs and difficult sounds.</span>
            </span>
            <span className="badge">{srSupported() ? `${pronSessionsThisWeek(progress, now)} this week` : 'Chrome or Edge'}</span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      </ul>
    </div>
  );
}
