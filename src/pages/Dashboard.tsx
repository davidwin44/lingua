import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { GoalRing } from '../components/GoalRing';
import { ForecastChart } from '../components/ForecastChart';
import { Icon } from '../components/Icon';
import {
  activeWeeks,
  canDoStatus,
  estimatedTextCoverage,
  knownLexItems,
  measuredRetention,
  shouldWelcomeBack,
  weeklyProgress,
} from '../lib/progress';
import { buildReviewQueue, dueReviews, forecast, nextNewCards } from '../lib/scheduler';
import { GOAL_LABELS } from './Onboarding';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function greeting(now: number): string {
  const h = new Date(now).getHours();
  return h >= 5 && h < 13 ? 'Buongiorno' : h >= 13 && h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

/**
 * Home. Shows real learning (words known, coverage, measured retention vs target, can-do
 * statements): no leaderboards, no daily streak, no loss framing.
 */
export function Dashboard() {
  const { pack, lexicon, progress, update } = useApp();
  const now = useNow(60_000);

  const weekly = weeklyProgress(progress, now);
  const welcome = shouldWelcomeBack(progress, now);
  const queue = buildReviewQueue(progress, now);
  const newAvailable = nextNewCards(progress, lexicon, now).length;
  const days = forecast(progress, now);
  const known = knownLexItems(progress, lexicon);
  const textCoverage = estimatedTextCoverage(known, pack.meta.zipfListSize);
  const retention = measuredRetention(progress, now);
  const target = progress.settings.desiredRetention;
  const cando = canDoStatus(progress, pack);
  const weeks = activeWeeks(progress);
  const goal = progress.goal;
  const overdue = dueReviews(progress, now).length;
  const due = queue.ids.length;

  return (
    <div className="page dashboard">
      <header className="home-head">
        <div>
          <h1 lang="it">{greeting(now)}</h1>
          <p className="muted">
            Goal: {goal ? GOAL_LABELS[goal.reason].title.toLowerCase() : 'learning'}. {weekly.minutes} min and {weekly.sessions} session
            {weekly.sessions === 1 ? '' : 's'} this week{weeks > 1 ? `, ${weeks} weeks of study so far` : ''}.
          </p>
        </div>
        <GoalRing fraction={weekly.fraction} value={weekly.value} target={weekly.target} unit={goal?.unit ?? 'minutes'} />
      </header>

      {welcome ? (
        <section className="note note-warm" aria-labelledby="wb-title">
          <h2 id="wb-title" className="h3">
            Welcome back.
          </h2>
          <p>A short catch-up: the {Math.min(20, overdue)} most overdue cards. Anything else is spread over the coming days.</p>
          <div className="row-wrap">
            <Link to="/review?mode=catchup" className="btn btn-primary">
              Start the 20-card catch-up
            </Link>
            <button type="button" className="btn btn-link" onClick={() => update((p, t) => ({ ...p, welcomeBackDismissedAt: t }))}>
              Not now
            </button>
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="today-title">
        <h2 id="today-title">Today</h2>
        <div className="today-figures">
          <div>
            <span className="figure-num">{due}</span>
            <span className="figure-label">review{due === 1 ? '' : 's'} due</span>
          </div>
          <div>
            <span className="figure-num">{newAvailable}</span>
            <span className="figure-label">new word{newAvailable === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="row-wrap">
          {due > 0 ? (
            <Link to="/review" className="btn btn-primary">
              Review
            </Link>
          ) : null}
          {newAvailable > 0 ? (
            <Link to="/learn" className={`btn ${due > 0 ? 'btn-ghost' : 'btn-primary'}`}>
              Learn {newAvailable} new word{newAvailable === 1 ? '' : 's'}
            </Link>
          ) : null}
          {due === 0 && newAvailable === 0 ? (
            <p className="muted">
              Done for today. <Link to="/library">Read a passage</Link>?
            </p>
          ) : null}
        </div>
        {queue.heldBack > 0 ? <p className="muted small">{queue.heldBack} more are spread over the next few days.</p> : null}
      </section>

      <section className="section" aria-labelledby="fc-title">
        <h2 id="fc-title">Next 7 days</h2>
        {days.some((d) => d.shown > 0) ? (
          <ForecastChart days={days} cap={progress.settings.maxReviewsPerDay} />
        ) : (
          <p className="muted">Nothing scheduled yet. Words you learn will start appearing here.</p>
        )}
      </section>

      <section className="section" aria-labelledby="prog-title">
        <h2 id="prog-title">Progress</h2>
        <dl className="stats">
          <div>
            <dt>Words known</dt>
            <dd>
              {known.length} <span className="muted">of {lexicon.length}</span>
            </dd>
          </div>
          <div>
            <dt>Everyday text covered (estimate)</dt>
            <dd>{pct(textCoverage)}</dd>
          </div>
          <div>
            <dt>Recall on reviews, last 30 days (target {pct(target)})</dt>
            <dd>{retention.rate == null ? <span className="muted">no reviews yet</span> : pct(retention.rate)}</dd>
          </div>
          <div>
            <dt>Grammar lessons</dt>
            <dd>
              {Object.keys(progress.lessonsCompleted).length} <span className="muted">of {pack.grammar.length}</span>
            </dd>
          </div>
          <div>
            <dt>Passages read</dt>
            <dd>
              {Object.keys(progress.passagesCompleted).length} <span className="muted">of {pack.passages.length}</span>
            </dd>
          </div>
        </dl>
        <p className="muted small">
          Recall should sit near your target once cards return after a day or more. Text coverage is estimated from word frequency.
        </p>
      </section>

      <section className="section" aria-labelledby="cando-title">
        <h2 id="cando-title">I can…</h2>
        <ul className="cando-list">
          {cando.map((c) => (
            <li key={c.cando.id} className={c.done ? 'is-done' : ''}>
              <span className="cando-box" aria-hidden="true">
                {c.done ? <Icon name="check" size={12} /> : null}
              </span>
              <span className="cando-text">
                {c.cando.text}
                <span className="sr-only">{c.done ? ' (done)' : ` (${c.completed} of ${c.total} steps done)`}</span>
                {!c.done && c.completed > 0 ? (
                  <span className="muted small">
                    {' '}
                    ({c.completed}/{c.total})
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
