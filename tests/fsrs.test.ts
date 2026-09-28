import { describe, expect, it } from 'vitest';
import {
  DAY,
  DEFAULT_PARAMS,
  MINUTE,
  createCard,
  factorOf,
  fuzzInterval,
  initialDifficulty,
  initialStability,
  intervalMultiplier,
  mulberry32,
  nextDifficulty,
  nextInterval,
  retrievability,
  reviewCard,
  shortTermStability,
  type Grade,
  type SchedCard,
} from '../src/lib/fsrs';

const noFuzz = { ...DEFAULT_PARAMS, enableFuzz: false };
const T0 = new Date(2026, 0, 5, 9, 0, 0).getTime();

function reviewCardAt(s: number, d: number, lastReviewDaysAgo: number): SchedCard {
  return {
    state: 'review',
    step: 0,
    stability: s,
    difficulty: d,
    due: T0,
    lastReview: T0 - lastReviewDaysAgo * DAY,
    reps: 3,
    lapses: 0,
  };
}

describe('FSRS-6 forgetting curve and intervals', () => {
  it('FACTOR is about 0.980 with default weights', () => {
    expect(factorOf()).toBeCloseTo(0.9805, 3);
  });

  it('R(S, S) = 0.9 within 1e-6', () => {
    for (const s of [0.5, 1, 2.3065, 10, 123.4]) {
      expect(Math.abs(retrievability(s, s) - 0.9)).toBeLessThan(1e-6);
    }
  });

  it('R starts at 1 and decreases with time', () => {
    expect(retrievability(0, 5)).toBeCloseTo(1, 10);
    expect(retrievability(10, 5)).toBeLessThan(retrievability(5, 5));
  });

  it('interval at r = 0.9 rounds to S for S = 10', () => {
    expect(nextInterval(10, 0.9)).toBe(10);
  });

  it('interval at r = 0.8 is about 3.32 × S', () => {
    expect(intervalMultiplier(0.8)).toBeCloseTo(3.32, 1);
    expect(nextInterval(10, 0.8)).toBe(33);
    expect(intervalMultiplier(0.85)).toBeCloseTo(1.91, 1);
    expect(intervalMultiplier(0.95)).toBeCloseTo(0.4, 1);
  });

  it('intervals are clamped to [1, maximumInterval]', () => {
    expect(nextInterval(0.01, 0.9)).toBe(1);
    expect(nextInterval(1e9, 0.9, 36500)).toBe(36500);
  });
});

describe('FSRS-6 initial state', () => {
  it('initial stability matches w0..w3', () => {
    expect(initialStability(1)).toBe(0.212);
    expect(initialStability(2)).toBe(1.2931);
    expect(initialStability(3)).toBe(2.3065);
    expect(initialStability(4)).toBe(8.2956);
  });

  it('initial difficulty matches the listed values', () => {
    expect(initialDifficulty(1)).toBeCloseTo(6.41, 2);
    expect(initialDifficulty(2)).toBeCloseTo(5.11, 2);
    expect(initialDifficulty(3)).toBeCloseTo(2.12, 2);
    expect(initialDifficulty(4)).toBe(1);
  });
});

describe('FSRS-6 updates', () => {
  it('after a Good review S increases; after Again S decreases', () => {
    const card = reviewCardAt(10, 5, 10);
    const good = reviewCard(card, 3, T0, noFuzz).card;
    const again = reviewCard(card, 1, T0, noFuzz).card;
    expect(good.stability).toBeGreaterThan(10);
    expect(again.stability).toBeLessThan(10);
    expect(again.state).toBe('relearning');
    expect(again.lapses).toBe(1);
  });

  it('Hard < Good < Easy for stability after a successful review', () => {
    const card = reviewCardAt(10, 5, 10);
    const [h, g, e] = ([2, 3, 4] as Grade[]).map((gr) => reviewCard(card, gr, T0, noFuzz).card.stability);
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });

  it('D stays within [1, 10] under repeated extreme grades', () => {
    let d = 5;
    for (let i = 0; i < 50; i++) {
      d = nextDifficulty(d, 1);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
    expect(d).toBeCloseTo(10, 0);
    for (let i = 0; i < 50; i++) {
      d = nextDifficulty(d, 4);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
    expect(d).toBeLessThan(1.5);
  });

  it('same-day review uses the short-term formula; G ≥ 2 never lowers S', () => {
    expect(shortTermStability(2.3065, 3)).toBeGreaterThanOrEqual(2.3065);
    expect(shortTermStability(2.3065, 2)).toBeGreaterThanOrEqual(2.3065);
    expect(shortTermStability(2.3065, 1)).toBeLessThan(2.3065);
  });
});

describe('fuzz', () => {
  it('is 0 below 2.5 days', () => {
    const rng = mulberry32(1);
    for (const ivl of [1, 2, 2.4]) expect(fuzzInterval(ivl, rng)).toBe(ivl);
  });

  it('is deterministic with a seeded RNG and stays within ±delta', () => {
    const a = [10, 30, 100].map((i) => fuzzInterval(i, mulberry32(42)));
    const b = [10, 30, 100].map((i) => fuzzInterval(i, mulberry32(42)));
    expect(a).toEqual(b);
    // delta(10) = 1 + 0.15*4.5 + 0.1*3 = 1.975 → [8, 12]
    for (let seed = 0; seed < 200; seed++) {
      const f = fuzzInterval(10, mulberry32(seed));
      expect(f).toBeGreaterThanOrEqual(8);
      expect(f).toBeLessThanOrEqual(12);
    }
  });

  it('actually varies across seeds for long intervals', () => {
    const values = new Set(Array.from({ length: 50 }, (_, s) => fuzzInterval(60, mulberry32(s))));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('card states and learning steps', () => {
  it('learning steps: 1m → 10m → graduate', () => {
    let card = createCard(T0);
    // Again on a new card: first step (1 minute).
    let out = reviewCard(card, 1, T0, noFuzz);
    card = out.card;
    expect(card.state).toBe('learning');
    expect(card.due - T0).toBe(1 * MINUTE);

    // Good: next step (10 minutes).
    const t1 = T0 + MINUTE;
    out = reviewCard(card, 3, t1, noFuzz);
    card = out.card;
    expect(card.state).toBe('learning');
    expect(card.step).toBe(1);
    expect(card.due - t1).toBe(10 * MINUTE);

    // Good after the last step: graduate to Review with a day-scale interval.
    const t2 = t1 + 10 * MINUTE;
    out = reviewCard(card, 3, t2, noFuzz);
    card = out.card;
    expect(card.state).toBe('review');
    expect(card.due - t2).toBeGreaterThanOrEqual(DAY);
  });

  it('Good on a new card goes to the 10-minute step; Hard repeats the step', () => {
    const good = reviewCard(createCard(T0), 3, T0, noFuzz).card;
    expect(good.due - T0).toBe(10 * MINUTE);
    const hard = reviewCard(good, 2, T0 + 10 * MINUTE, noFuzz).card;
    expect(hard.step).toBe(1);
    expect(hard.due - (T0 + 10 * MINUTE)).toBe(10 * MINUTE);
  });

  it('Easy graduates immediately', () => {
    const easy = reviewCard(createCard(T0), 4, T0, noFuzz).card;
    expect(easy.state).toBe('review');
    expect(easy.stability).toBeCloseTo(8.2956, 4);
    expect(Math.round((easy.due - T0) / DAY)).toBe(8);
  });

  it('a lapse goes through the 10-minute relearning step back to Review', () => {
    const lapsed = reviewCard(reviewCardAt(20, 5, 20), 1, T0, noFuzz).card;
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.due - T0).toBe(10 * MINUTE);
    const back = reviewCard(lapsed, 3, T0 + 10 * MINUTE, noFuzz).card;
    expect(back.state).toBe('review');
  });
});
