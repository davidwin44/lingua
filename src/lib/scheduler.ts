/**
 * Queue building, daily limits, backlog cap and forecast.
 *
 * Principle 3: cap new cards per day — get each item right once, then let sleep work.
 * Principle 4: new words come strictly in frequency order.
 * Principle 5: recognition (L2→L1) first; a word's production card (L1→L2) unlocks only
 *              after its recognition card has first reached the Review state.
 * Principle 10: a review backlog is capped per day and spread over the following days,
 *              never dumped as a wall.
 *
 * Due cards are mixed in random order. This is NOT interleaving: interleaving only helps for
 * confusable grammar categories and hurts for word lists (g = -0.39), so it is used only in
 * grammar Mixed Practice (see lib/interleave.ts).
 */
import type { LexItem } from '../content/lexicon';
import { addDays, dayEnd, dayStart, weekdayLabel } from './dates';
import type { CardRecord, Progress } from './types';

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cards studied for the first time today (they count against the new-card cap). */
export function introducedToday(p: Progress, now: number): number {
  const start = dayStart(now);
  return Object.values(p.cards).filter((c) => c.introducedAt != null && c.introducedAt >= start).length;
}

/** Reviews of Review-state cards done today (they count against the daily review cap). */
export function reviewsDoneToday(p: Progress, now: number): number {
  const start = dayStart(now);
  let n = 0;
  for (let i = p.reviewLog.length - 1; i >= 0; i--) {
    const e = p.reviewLog[i];
    if (e.timestamp < start) break;
    if (e.stateBefore === 'review') n++;
  }
  return n;
}

export function newCardsRemainingToday(p: Progress, now: number): number {
  return Math.max(0, p.settings.newPerDay - introducedToday(p, now));
}

/**
 * The next new cards to introduce, up to the daily cap:
 * learner-added (priority) cards first, then frequency-ordered recognition cards alternating
 * with unlocked production cards, so production practice doesn't crowd out new words.
 */
export function nextNewCards(p: Progress, lexicon: readonly LexItem[], now: number, limit?: number): string[] {
  const remaining = limit ?? newCardsRemainingToday(p, now);
  if (remaining <= 0) return [];

  const priority = Object.values(p.cards)
    .filter((c) => c.state === 'new' && c.priority)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.id);

  const rec: string[] = [];
  const prod: string[] = [];
  for (const item of lexicon) {
    const recId = `rec:${item.id}`;
    const recCard = p.cards[recId];
    if (!recCard || (recCard.state === 'new' && !recCard.priority)) rec.push(recId);
    // Production unlocks only once recognition has graduated (first reached Review).
    if (recCard?.graduatedAt != null) {
      const prodCard = p.cards[`prod:${item.id}`];
      if (!prodCard || prodCard.state === 'new') prod.push(`prod:${item.id}`);
    }
  }

  const out: string[] = [];
  const push = (id: string | undefined) => {
    if (id && !out.includes(id) && out.length < remaining) out.push(id);
  };
  priority.forEach(push);
  let i = 0;
  while (out.length < remaining && (i < rec.length || i < prod.length)) {
    push(rec[i]);
    push(prod[i]);
    i++;
  }
  return out;
}

export function isLearning(c: CardRecord): boolean {
  return c.state === 'learning' || c.state === 'relearning';
}

/** Learning / relearning cards due now (intraday steps are never capped). */
export function dueLearning(p: Progress, now: number): CardRecord[] {
  return Object.values(p.cards)
    .filter((c) => isLearning(c) && c.due <= now)
    .sort((a, b) => a.due - b.due);
}

/** Review-state cards due by the end of today, most overdue first. */
export function dueReviews(p: Progress, now: number): CardRecord[] {
  const end = dayEnd(now);
  return Object.values(p.cards)
    .filter((c) => c.state === 'review' && c.due < end)
    .sort((a, b) => a.due - b.due);
}

export interface ReviewQueue {
  ids: string[];
  /** All review cards due today, before the cap. */
  dueTotal: number;
  /** How many due reviews were held back by the cap (they roll over to later days). */
  heldBack: number;
}

export function buildReviewQueue(
  p: Progress,
  now: number,
  opts: { rng?: () => number; catchUpLimit?: number } = {},
): ReviewQueue {
  const learning = dueLearning(p, now).map((c) => c.id);
  const reviews = dueReviews(p, now);
  if (opts.catchUpLimit != null) {
    // Welcome-back catch-up: a short, capped session of the most overdue cards first.
    const ids = [...learning, ...reviews.map((c) => c.id)].slice(0, opts.catchUpLimit);
    return { ids, dueTotal: reviews.length, heldBack: Math.max(0, reviews.length - ids.length) };
  }
  const capacity = Math.max(0, p.settings.maxReviewsPerDay - reviewsDoneToday(p, now));
  const chosen = reviews.slice(0, capacity).map((c) => c.id);
  // Random mix of due cards (not topic-grouped). Deliberately not called "interleaving".
  const ids = shuffle([...learning, ...chosen], opts.rng);
  return { ids, dueTotal: reviews.length, heldBack: reviews.length - chosen.length };
}

/** Earliest upcoming learning-step due time (for "back in 9 minutes" messages). */
export function nextLearningDueAt(p: Progress, now: number): number | null {
  let best: number | null = null;
  for (const c of Object.values(p.cards)) {
    if (isLearning(c) && c.due > now && (best == null || c.due < best)) best = c.due;
  }
  return best;
}

export interface ForecastDay {
  ts: number;
  label: string;
  /** Cards falling due that day (day 0 includes anything overdue). */
  due: number;
  /** Cards the app will actually show that day after the daily cap and carry-over. */
  shown: number;
}

/**
 * Projected review load for the next N days. Overflow above the daily cap is carried forward,
 * which is exactly how the queue behaves: the backlog is spread, not dumped.
 */
export function forecast(p: Progress, now: number, days = 7): ForecastDay[] {
  const starts = Array.from({ length: days + 1 }, (_, i) => (i === 0 ? dayStart(now) : addDays(dayStart(now), i)));
  const reviewCounts = new Array<number>(days).fill(0);
  let learningToday = 0;
  for (const c of Object.values(p.cards)) {
    if (c.state === 'new') continue;
    let idx = -1;
    if (c.due < starts[1]) idx = 0;
    else for (let i = 1; i < days; i++) if (c.due >= starts[i] && c.due < starts[i + 1]) idx = i;
    if (idx < 0) continue;
    if (idx === 0 && isLearning(c)) learningToday++;
    else reviewCounts[idx]++;
  }
  const cap = p.settings.maxReviewsPerDay;
  let carry = 0;
  return reviewCounts.map((count, i) => {
    const capacity = i === 0 ? Math.max(0, cap - reviewsDoneToday(p, now)) : cap;
    const total = count + carry;
    const shownReviews = Math.min(total, capacity);
    carry = total - shownReviews;
    const extra = i === 0 ? learningToday : 0;
    return {
      ts: starts[i],
      label: i === 0 ? 'Today' : weekdayLabel(starts[i]),
      due: count + extra,
      shown: shownReviews + extra,
    };
  });
}
