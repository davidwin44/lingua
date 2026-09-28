import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { MINUTE, type Grade } from '../lib/fsrs';
import { applyReview, recordActivity } from '../lib/progress';
import { buildReviewQueue, dueLearning, nextLearningDueAt, nextNewCards, newCardsRemainingToday } from '../lib/scheduler';
import { buildCardModel, CardBack, StudyCard } from './Card';

export type StudyMode = 'learn' | 'review' | 'catchup';

type Item = { id: string; phase: 'intro' | 'test' };

/** Show a few new words, then test the first one, so each test is a real retrieval. */
const INTRO_AHEAD = 3;
/** When nothing else is left, learning cards due within this window may be studied early. */
const LEARN_AHEAD_MS = 20 * MINUTE;

/**
 * A study session.
 * - learn: new words in frequency order (intro → typed recall), plus any learning steps due.
 * - review: due cards, capped per day, mixed in random order (not interleaving).
 * - catchup: welcome-back session, the 20 most overdue cards first.
 */
export function StudySession({ mode }: { mode: StudyMode }) {
  const { pack, lexicon, lexMap, drills, progress, update } = useApp();
  const now = useNow(5_000);

  // The session's plan is frozen when it starts (so the queue doesn't shift mid-session).
  const [plan] = useState(() => {
    const t = Date.now();
    if (mode === 'learn') return { newIds: nextNewCards(progress, lexicon, t), reviewIds: [] as string[], heldBack: 0 };
    const q = buildReviewQueue(progress, t, { catchUpLimit: mode === 'catchup' ? 20 : undefined });
    return { newIds: [] as string[], reviewIds: q.ids, heldBack: q.heldBack };
  });
  const [introduced, setIntroduced] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
  const [seq, setSeq] = useState(0);
  const [learnAhead, setLearnAhead] = useState(false);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const introStart = useRef(Date.now());

  const isNew = (id: string) => (progress.cards[id]?.state ?? 'new') === 'new';
  const pendingNew = plan.newIds.filter((id) => isNew(id) && !introduced.includes(id));
  const waitingTests = introduced.filter(isNew);
  const remainingReviews = plan.reviewIds.filter((id) => !done.includes(id) && progress.cards[id]?.state === 'review');
  const learningDue = dueLearning(progress, now + (learnAhead ? LEARN_AHEAD_MS : 0));

  const pickNext = (): Item | null => {
    if (learningDue.length > 0) return { id: learningDue[0].id, phase: 'test' };
    if (mode === 'learn') {
      if (waitingTests.length > 0 && (waitingTests.length >= INTRO_AHEAD || pendingNew.length === 0)) {
        return { id: waitingTests[0], phase: 'test' };
      }
      if (pendingNew.length > 0) {
        const id = pendingNew[0];
        // Production cards test a word already learned by recognition, so they skip the intro.
        return { id, phase: id.startsWith('prod:') ? 'test' : 'intro' };
      }
      return null;
    }
    return remainingReviews.length > 0 ? { id: remainingReviews[0], phase: 'test' } : null;
  };

  // Choose the next item whenever the current one is finished (or time passes and a learning step comes due).
  useEffect(() => {
    if (current) return;
    const next = pickNext();
    if (next) {
      introStart.current = Date.now();
      setCurrent(next);
      setSeq((s) => s + 1);
    }
    // pickNext reads the values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, progress, now, learnAhead]);

  const model = useMemo(
    () => (current ? buildCardModel(current.id, { lexMap, drills, progress }) : null),
    // Rebuild only when the card changes, not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id, seq],
  );

  // Skip any card whose content no longer exists (e.g. removed from a pack).
  useEffect(() => {
    if (current && !model) {
      setDone((d) => [...d, current.id]);
      setCurrent(null);
    }
  }, [current, model]);

  const onGraded = (grade: Grade, elapsedMs: number) => {
    if (!current) return;
    const id = current.id;
    update((p, t) => applyReview(p, id, grade, t, { activityMs: elapsedMs }));
    setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (grade >= 2 ? 1 : 0) }));
    setIntroduced((list) => list.filter((x) => x !== id));
    setDone((d) => [...d, id]);
    setCurrent(null);
  };

  const onIntroDone = () => {
    if (!current) return;
    const id = current.id;
    const ms = Date.now() - introStart.current;
    update((p, t) => recordActivity(p, t, ms));
    setIntroduced((list) => [...list, id]);
    setCurrent(null);
  };

  const counts = {
    newLeft: pendingNew.length + waitingTests.length,
    learning: dueLearning(progress, now).length,
    reviews: remainingReviews.length,
  };

  const header = (
    <div className="session-counts" aria-label="Cards left in this session">
      {mode === 'learn' ? (
        <span>
          <strong>{counts.newLeft}</strong> new
        </span>
      ) : null}
      <span>
        <strong>{counts.learning}</strong> in learning
      </span>
      {mode !== 'learn' ? (
        <span>
          <strong>{counts.reviews}</strong> to review
        </span>
      ) : null}
    </div>
  );

  if (current && model) {
    if (current.phase === 'intro') {
      return (
        <div className="session">
          {header}
          <IntroCard key={`${current.id}-${seq}`} onDone={onIntroDone}>
            <CardBack model={model} pack={pack} />
          </IntroCard>
        </div>
      );
    }
    return (
      <div className="session">
        {header}
        <StudyCard key={`${current.id}-${seq}`} model={model} pack={pack} progress={progress} now={Date.now()} onGraded={onGraded} />
      </div>
    );
  }

  // Finished (for now).
  const nextDue = nextLearningDueAt(progress, now);
  const minutesUntil = nextDue ? Math.max(1, Math.ceil((nextDue - now) / MINUTE)) : null;
  const newLeftToday = newCardsRemainingToday(progress, now);
  return (
    <div className="session session-done section">
      <h2>{stats.answered > 0 ? 'Session complete' : mode === 'learn' ? 'Nothing new right now' : 'Nothing due'}</h2>
      {stats.answered > 0 ? (
        <p>
          {stats.answered} card{stats.answered === 1 ? '' : 's'}, {stats.correct} recalled.
        </p>
      ) : null}
      {minutesUntil ? (
        <div className="note">
          <p>Some cards come back in about {minutesUntil} min. Keep this page open, or come back later.</p>
          {nextDue && nextDue - now <= LEARN_AHEAD_MS && !learnAhead ? (
            <button type="button" className="btn btn-ghost" onClick={() => setLearnAhead(true)}>
              Study them now instead
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === 'learn' && newLeftToday === 0 ? (
        <p className="muted">That’s today’s new words. More tomorrow.</p>
      ) : null}
      {mode !== 'learn' && plan.heldBack > 0 ? (
        <p className="muted">
          {plan.heldBack} more review{plan.heldBack === 1 ? ' is' : 's are'} spread over the next few days.
        </p>
      ) : null}
      <div className="row-wrap">
        <Link className="btn btn-primary" to="/">
          Home
        </Link>
        {mode !== 'learn' && newLeftToday > 0 ? (
          <Link className="btn btn-ghost" to="/learn">
            Learn new words
          </Link>
        ) : null}
        <Link className="btn btn-ghost" to="/library">
          Read something
        </Link>
      </div>
    </div>
  );
}

function IntroCard({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  return (
    <article className="study-card intro-card">
      <p className="tag tag-new">New word</p>
      {children}
      <button type="button" className="btn btn-primary btn-block" onClick={onDone} autoFocus>
        Continue
      </button>
    </article>
  );
}
