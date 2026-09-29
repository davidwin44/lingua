import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { GoalRing } from '../components/GoalRing';
import { ForecastChart } from '../components/ForecastChart';
import { Icon } from '../components/Icon';
import { passageCoverage } from '../lib/coverage';
import {
  activeWeeks,
  canDoStatus,
  estimatedTextCoverage,
  knownLemmas,
  knownLexItems,
  measuredRetention,
  shouldWelcomeBack,
  weeklyProgress,
} from '../lib/progress';
import { buildReviewQueue, dueReviews, forecast, nextNewCards } from '../lib/scheduler';
import { GOAL_LABELS } from './Onboarding';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function greeting(now: number): string {
  const h = new Date(now).getHours();
  return h >= 5 && h < 13 ? 'Buongiorno' : h >= 13 && h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

/** One measured quantity with its bar; `target` draws a tick where the bar should reach. */
function Bar({ label, value, of, fraction, target }: { label: string; value: ReactNode; of?: ReactNode; fraction: number; target?: number }) {
  return (
    <li className="bar-row">
      <span className="bar-row-label">{label}</span>
      <span className="bar-row-value">
        {value}
        {of ? <span className="muted"> {of}</span> : null}
      </span>
      <span className="meter" aria-hidden="true">
        <span style={{ width: `${Math.round(clamp01(fraction) * 100)}%` }} />
        {target !== undefined ? <i className="meter-target" style={{ left: `${Math.round(clamp01(target) * 100)}%` }} /> : null}
      </span>
    </li>
  );
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
  const lessonsDone = Object.keys(progress.lessonsCompleted).length;
  const passagesDone = Object.keys(progress.passagesCompleted).length;

  const nextLesson = pack.grammar.find((l) => !progress.lessonsCompleted[l.id]);
  const lemmas = knownLemmas(progress, lexicon);
  const nextPassage = pack.passages
    .filter((p) => !progress.passagesCompleted[p.id])
    .map((p) => ({ p, cov: passageCoverage(p, lemmas) }))
    .sort((a, b) => b.cov.ratio - a.cov.ratio)[0];

  return (
    <div className="page page-wide dashboard">
      <header className="page-head">
        <div>
          <h1 lang="it">{greeting(now)}</h1>
          <p className="muted">
            Goal: {goal ? GOAL_LABELS[goal.reason].title.toLowerCase() : 'learning'}. {weekly.minutes} min and {weekly.sessions} session
            {weekly.sessions === 1 ? '' : 's'} this week{weeks > 1 ? `, ${weeks} weeks of study so far` : ''}.
          </p>
        </div>
      </header>

      {welcome ? (
        <section className="alert-card" aria-labelledby="wb-title">
          <h2 id="wb-title" className="h3">
            Welcome back.
          </h2>
          <p>
            {overdue > 0
              ? `A short catch-up: the ${Math.min(20, overdue)} most overdue card${Math.min(20, overdue) === 1 ? '' : 's'}. Anything else is spread over the coming days.`
              : 'Nothing has piled up while you were away, so a short catch-up is all it takes to get going again.'}
          </p>
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

      <div className="widget-grid">
        <section className="widget widget-span-2" aria-labelledby="today-title">
          <h2 id="today-title">Today</h2>
          <div className="today-figures">
            <p>
              <span className="figure-num">{due}</span>
              <span className="figure-label">review{due === 1 ? '' : 's'} due</span>
            </p>
            <p>
              <span className="figure-num">{newAvailable}</span>
              <span className="figure-label">new word{newAvailable === 1 ? '' : 's'}</span>
            </p>
          </div>
          <ul className="action-list">
            {due > 0 ? (
              <li>
                <Link to="/review" className="action-row">
                  <span className="action-main">
                    <span className="action-title">Review</span>
                    <span className="action-sub">Cards the scheduler has brought back, in random order</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            ) : null}
            {newAvailable > 0 ? (
              <li>
                <Link to="/learn" className="action-row">
                  <span className="action-main">
                    <span className="action-title">
                      Learn {newAvailable} new word{newAvailable === 1 ? '' : 's'}
                    </span>
                    <span className="action-sub">The next most common words, three at a time</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            ) : null}
            {nextLesson ? (
              <li>
                <Link to={`/grammar/${nextLesson.id}`} className="action-row">
                  <span className="action-main">
                    <span className="action-title">Grammar: {nextLesson.title}</span>
                    <span className="action-sub">
                      Lesson {nextLesson.order}, {nextLesson.level}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            ) : null}
            {nextPassage ? (
              <li>
                <Link to={`/library/${nextPassage.p.id}`} className="action-row">
                  <span className="action-main">
                    <span className="action-title">
                      Read: <span lang={pack.meta.ttsLang}>{nextPassage.p.title}</span>
                    </span>
                    <span className="action-sub">
                      {nextPassage.p.level}, and you know {pct(nextPassage.cov.ratio)} of its words
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            ) : null}
          </ul>
          {due === 0 && newAvailable === 0 ? <p className="muted small">Cards are done for today.</p> : null}
          {queue.heldBack > 0 ? <p className="muted small">{queue.heldBack} more are spread over the next few days.</p> : null}
        </section>

        <section className="widget widget-goal" aria-labelledby="goal-title">
          <h2 id="goal-title">This week</h2>
          <GoalRing fraction={weekly.fraction} value={weekly.value} target={weekly.target} unit={goal?.unit ?? 'minutes'} />
          <dl className="goal-facts">
            <div>
              <dt>Minutes</dt>
              <dd>{weekly.minutes}</dd>
            </div>
            <div>
              <dt>Sessions</dt>
              <dd>{weekly.sessions}</dd>
            </div>
            <div>
              <dt>Weeks studied</dt>
              <dd>{weeks}</dd>
            </div>
          </dl>
        </section>

        <section className="widget widget-span-2" aria-labelledby="fc-title">
          <h2 id="fc-title">Next 7 days</h2>
          {days.some((d) => d.shown > 0) ? (
            <ForecastChart days={days} cap={progress.settings.maxReviewsPerDay} />
          ) : (
            <p className="muted">Nothing scheduled yet. Words you learn will start appearing here.</p>
          )}
        </section>

        <section className="widget" aria-labelledby="prog-title">
          <h2 id="prog-title">Progress</h2>
          <ul className="bar-list">
            <Bar label="Words known" value={known.length} of={`of ${lexicon.length}`} fraction={lexicon.length ? known.length / lexicon.length : 0} />
            <Bar label="Everyday text covered (estimate)" value={pct(textCoverage)} fraction={textCoverage} />
            <Bar
              label={`Recall on reviews, last 30 days (target ${pct(target)})`}
              value={retention.rate == null ? <span className="muted">no reviews yet</span> : pct(retention.rate)}
              fraction={retention.rate ?? 0}
              target={target}
            />
            <Bar label="Grammar lessons" value={lessonsDone} of={`of ${pack.grammar.length}`} fraction={lessonsDone / Math.max(1, pack.grammar.length)} />
            <Bar label="Passages read" value={passagesDone} of={`of ${pack.passages.length}`} fraction={passagesDone / Math.max(1, pack.passages.length)} />
          </ul>
          <p className="muted small">
            Recall should sit near your target once cards return after a day or more. Text coverage is estimated from word frequency.
          </p>
        </section>

        <section className="widget widget-span-3" aria-labelledby="cando-title">
          <div className="section-head">
            <h2 id="cando-title">I can…</h2>
            <p className="muted small">
              {cando.filter((c) => c.done).length} of {cando.length} done
            </p>
          </div>
          <ul className="cando-list">
            {cando.map((c) => {
              const state = c.done ? 'done' : c.completed > 0 ? 'started' : 'todo';
              return (
                <li key={c.cando.id} className={`is-${state}`}>
                  <span className="cando-box" aria-hidden="true">
                    {c.done ? <Icon name="check" size={12} /> : null}
                  </span>
                  <span className="cando-text">
                    {c.cando.text}
                    <span className="sr-only">{c.done ? ' (done)' : ` (${c.completed} of ${c.total} steps done)`}</span>
                  </span>
                  <span className={`cando-count ${c.done ? 'cando-count-done' : ''}`} aria-hidden="true">
                    {c.done ? 'Done' : `${c.completed}/${c.total}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
