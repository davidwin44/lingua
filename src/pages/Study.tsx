import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { buildReviewQueue, nextNewCards } from '../lib/scheduler';
import { Icon } from '../components/Icon';

export function Study() {
  const { lexicon, progress } = useApp();
  const now = useNow(30_000);
  const queue = buildReviewQueue(progress, now);
  const newIds = nextNewCards(progress, lexicon, now);
  const deckSize = Object.values(progress.cards).filter((c) => c.state !== 'new').length;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Study</h1>
          <p className="muted">Type what you remember. The answer always follows, and the scheduler decides when each card comes back.</p>
        </div>
      </header>
      <ul className="card-list">
        <li>
          <Link to="/review" className="card-row">
            <span className="card-row-main">
              <span className="card-row-title">Review</span>
              <span className="card-row-sub">Cards the scheduler has brought back, in random order.</span>
            </span>
            <span className={`row-state ${queue.ids.length > 0 ? 'row-state-primary' : ''}`}>
              {queue.ids.length > 0 ? `${queue.ids.length} due` : 'none due'}
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link to="/learn" className="card-row">
            <span className="card-row-main">
              <span className="card-row-title">New words</span>
              <span className="card-row-sub">The next most common words.</span>
            </span>
            <span className={`row-state ${newIds.length > 0 ? 'row-state-warm' : ''}`}>{newIds.length > 0 ? `${newIds.length} ready` : 'done for today'}</span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link to="/grammar" className="card-row">
            <span className="card-row-main">
              <span className="card-row-title">Grammar</span>
              <span className="card-row-sub">Short lessons and mixed practice.</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      </ul>
      <p className="muted small">
        {deckSize} card{deckSize === 1 ? '' : 's'} in your deck. Daily limits and target recall are in <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}
