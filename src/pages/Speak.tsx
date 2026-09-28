import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { pronSessionsThisWeek } from '../lib/progress';
import { srSupported } from '../lib/speech';

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
    <div className="page">
      <h1>Speaking and writing</h1>
      <ul className="index-list">
        <li>
          <Link to="/produce" className="row-link">
            <div className="row-main">
              <p className="row-title">Sentence building</p>
              <p className="muted small">Put short English sentences into {pack.meta.name}. Works offline.</p>
            </div>
            <span className="row-meta">
              {done}/{pack.production.length}
            </span>
          </Link>
        </li>
        <li>
          <Link to="/tutor" className="row-link">
            <div className="row-main">
              <p className="row-title">Role-play</p>
              <p className="muted small">A café, a hotel, asking the way. With corrections from Claude.</p>
            </div>
            <span className="row-meta">{hasKey ? '' : 'needs API key'}</span>
          </Link>
        </li>
        <li>
          <Link to="/pronounce" className="row-link">
            <div className="row-main">
              <p className="row-title">Pronunciation</p>
              <p className="muted small">Minimal pairs and difficult sounds.</p>
            </div>
            <span className="row-meta">{srSupported() ? `${pronSessionsThisWeek(progress, now)} this week` : 'Chrome or Edge'}</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
