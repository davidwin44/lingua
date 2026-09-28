import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { buildReviewQueue, nextNewCards } from '../lib/scheduler';

export function Study() {
  const { lexicon, progress } = useApp();
  const now = useNow(30_000);
  const queue = buildReviewQueue(progress, now);
  const newIds = nextNewCards(progress, lexicon, now);
  const deckSize = Object.values(progress.cards).filter((c) => c.state !== 'new').length;

  return (
    <div className="page">
      <h1>Study</h1>
      <ul className="index-list">
        <li>
          <Link to="/review" className="row-link">
            <div className="row-main">
              <p className="row-title">Review</p>
              <p className="muted small">Cards the scheduler has brought back, in random order.</p>
            </div>
            <span className="row-meta">{queue.ids.length > 0 ? `${queue.ids.length} due` : 'none due'}</span>
          </Link>
        </li>
        <li>
          <Link to="/learn" className="row-link">
            <div className="row-main">
              <p className="row-title">New words</p>
              <p className="muted small">The next most common words.</p>
            </div>
            <span className="row-meta">{newIds.length > 0 ? `${newIds.length} ready` : 'done for today'}</span>
          </Link>
        </li>
        <li>
          <Link to="/grammar" className="row-link">
            <div className="row-main">
              <p className="row-title">Grammar</p>
              <p className="muted small">Short lessons and mixed practice.</p>
            </div>
          </Link>
        </li>
      </ul>
      <p className="muted small">
        {deckSize} card{deckSize === 1 ? '' : 's'} in your deck. Daily limits and target recall are in <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}
