/**
 * FSRS-6 spaced-repetition scheduler (pure functions, no external SRS library).
 *
 * Principle 2: spacing across days beats massing (+10 pts recall, Cepeda 2006), and learners
 * misjudge this (72% think massing worked better, Kornell 2009) — so the app ENFORCES the
 * schedule rather than letting learners cram.
 * Principle 3: get each new item right once with feedback, then let sleep work. Short learning
 * steps (1 min, 10 min) are followed by day-scale intervals.
 *
 * Model: each card has difficulty D (1..10), stability S (days until recall probability falls
 * to 90%) and retrievability R (current recall probability). The next review is scheduled
 * for when predicted R falls to the desired retention.
 */

export type Grade = 1 | 2 | 3 | 4;
export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedCard {
  state: CardState;
  /** Index into learning / relearning steps. */
  step: number;
  stability: number;
  difficulty: number;
  /** Epoch ms when the card is next due. */
  due: number;
  lastReview: number | null;
  reps: number;
  lapses: number;
}

export interface FsrsParams {
  w: readonly number[];
  desiredRetention: number;
  maximumInterval: number;
  /** Learning steps in minutes. */
  learningSteps: readonly number[];
  relearningSteps: readonly number[];
  enableFuzz: boolean;
}

export const DEFAULT_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const MIN_STABILITY = 0.001;

export const DEFAULT_PARAMS: FsrsParams = {
  w: DEFAULT_WEIGHTS,
  desiredRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: [1, 10],
  relearningSteps: [10],
  enableFuzz: true,
};

export function decayOf(w: readonly number[] = DEFAULT_WEIGHTS): number {
  return -w[20];
}

/** FACTOR = 0.9^(1/DECAY) - 1, chosen so that R(S, S) = 0.9. About 0.980 with default weights. */
export function factorOf(w: readonly number[] = DEFAULT_WEIGHTS): number {
  return Math.pow(0.9, 1 / decayOf(w)) - 1;
}

/** R(t, S) = (1 + FACTOR * t / S)^DECAY, t in (fractional) days. */
export function retrievability(elapsedDays: number, stability: number, w: readonly number[] = DEFAULT_WEIGHTS): number {
  const t = Math.max(0, elapsedDays);
  return Math.pow(1 + (factorOf(w) * t) / Math.max(stability, MIN_STABILITY), decayOf(w));
}

/** Interval as a multiple of S for a given desired retention (0.9 → 1.00×, 0.8 → 3.32×). */
export function intervalMultiplier(desiredRetention: number, w: readonly number[] = DEFAULT_WEIGHTS): number {
  return (Math.pow(desiredRetention, 1 / decayOf(w)) - 1) / factorOf(w);
}

/** I = (S / FACTOR) * (r^(1/DECAY) - 1), rounded to whole days, clamped to [1, maximumInterval]. */
export function nextInterval(
  stability: number,
  desiredRetention = 0.9,
  maximumInterval = 36500,
  w: readonly number[] = DEFAULT_WEIGHTS,
): number {
  const raw = stability * intervalMultiplier(desiredRetention, w);
  return Math.min(Math.max(Math.round(raw), 1), maximumInterval);
}

const clampD = (d: number) => Math.min(Math.max(d, 1), 10);
const clampS = (s: number) => Math.max(s, MIN_STABILITY);

/** S0(G) = w[G-1]. */
export function initialStability(grade: Grade, w: readonly number[] = DEFAULT_WEIGHTS): number {
  return clampS(w[grade - 1]);
}

/** D0(G) = w4 - e^(w5*(G-1)) + 1, clamped to [1, 10]. */
export function initialDifficulty(grade: Grade, w: readonly number[] = DEFAULT_WEIGHTS): number {
  return clampD(w[4] - Math.exp(w[5] * (grade - 1)) + 1);
}

/** ΔD = -w6*(G-3); D' = D + ΔD*(10-D)/9; mean reversion D'' = w7*D0(4) + (1-w7)*D'; clamp [1,10]. */
export function nextDifficulty(d: number, grade: Grade, w: readonly number[] = DEFAULT_WEIGHTS): number {
  const delta = -w[6] * (grade - 3);
  const dPrime = d + (delta * (10 - d)) / 9;
  const reverted = w[7] * initialDifficulty(4, w) + (1 - w[7]) * dPrime;
  return clampD(reverted);
}

/** Stability after a successful review (G ≥ 2) with retrievability R at review time. */
export function stabilityAfterSuccess(
  s: number,
  d: number,
  r: number,
  grade: Grade,
  w: readonly number[] = DEFAULT_WEIGHTS,
): number {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  const inc =
    Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus;
  return clampS(s * (1 + inc));
}

/** Stability after a lapse (G = 1). */
export function stabilityAfterLapse(s: number, d: number, r: number, w: readonly number[] = DEFAULT_WEIGHTS): number {
  const longTerm = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  const shortTermCap = s / Math.exp(w[17] * w[18]);
  return clampS(Math.min(longTerm, shortTermCap));
}

/** Same-day review: S' = S * e^(w17*(G-3+w18)) * S^(-w19); for G ≥ 2 the multiplier is at least 1. */
export function shortTermStability(s: number, grade: Grade, w: readonly number[] = DEFAULT_WEIGHTS): number {
  let mult = Math.exp(w[17] * (grade - 3 + w[18])) * Math.pow(s, -w[19]);
  if (grade >= 2) mult = Math.max(mult, 1);
  return clampS(s * mult);
}

/** Deterministic PRNG for tests and reproducible shuffles. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

/** Fuzz delta: 1 + 0.15*(days in [2.5,7]) + 0.10*(days in [7,20]) + 0.05*(days above 20). */
export function fuzzDelta(interval: number): number {
  let delta = 1;
  for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(interval, r.end) - r.start, 0);
  return delta;
}

/**
 * Spread review intervals slightly so cards learned together don't stay clumped together.
 * No fuzz below 2.5 days. Otherwise uniform in [round(I - δ), round(I + δ)] (min 2 days).
 */
export function fuzzInterval(interval: number, rng: () => number, maximumInterval = 36500): number {
  if (interval < 2.5) return interval;
  const delta = fuzzDelta(interval);
  const lo = Math.max(2, Math.round(interval - delta));
  const hi = Math.min(Math.round(interval + delta), maximumInterval);
  const fuzzed = lo + Math.floor(rng() * (hi - lo + 1));
  return Math.min(Math.max(fuzzed, lo), hi);
}

export function createCard(now: number): SchedCard {
  return { state: 'new', step: 0, stability: 0, difficulty: 0, due: now, lastReview: null, reps: 0, lapses: 0 };
}

export interface ReviewOutcome {
  card: SchedCard;
  elapsedDays: number;
  /** Retrievability at review time (null for a new card). */
  retrievability: number | null;
  /** Scheduled interval in days (fractional for learning steps). */
  intervalDays: number;
}

function graduate(card: SchedCard, now: number, params: FsrsParams, rng: () => number): number {
  card.state = 'review';
  card.step = 0;
  let ivl = nextInterval(card.stability, params.desiredRetention, params.maximumInterval, params.w);
  if (params.enableFuzz) ivl = fuzzInterval(ivl, rng, params.maximumInterval);
  card.due = now + ivl * DAY;
  return ivl;
}

/**
 * Learning / relearning step logic:
 * Again → first step; Hard → repeat current step; Good → next step, graduating after the last;
 * Easy → graduate immediately.
 */
function applySteps(
  card: SchedCard,
  grade: Grade,
  steps: readonly number[],
  now: number,
  params: FsrsParams,
  rng: () => number,
): number {
  if (steps.length === 0 || grade === 4) return graduate(card, now, params, rng);
  if (grade === 1) {
    card.step = 0;
  } else if (grade === 3) {
    if (card.step + 1 >= steps.length) return graduate(card, now, params, rng);
    card.step += 1;
  } // grade 2: repeat current step
  const minutes = steps[Math.min(card.step, steps.length - 1)];
  card.due = now + minutes * MINUTE;
  return (minutes * MINUTE) / DAY;
}

export function reviewCard(
  input: SchedCard,
  grade: Grade,
  now: number,
  params: FsrsParams = DEFAULT_PARAMS,
  rng: () => number = Math.random,
): ReviewOutcome {
  const w = params.w;
  const card: SchedCard = { ...input };
  const elapsedDays = input.lastReview == null ? 0 : Math.max(0, (now - input.lastReview) / DAY);
  const r = input.state === 'new' || input.lastReview == null ? null : retrievability(elapsedDays, input.stability, w);
  let intervalDays: number;

  if (input.state === 'new') {
    card.stability = initialStability(grade, w);
    card.difficulty = initialDifficulty(grade, w);
    card.state = 'learning';
    card.step = 0;
    intervalDays = applySteps(card, grade, params.learningSteps, now, params, rng);
  } else {
    // Memory update. Same-day reviews use the short-term formula.
    if (elapsedDays < 1) card.stability = shortTermStability(input.stability, grade, w);
    else if (grade === 1) card.stability = stabilityAfterLapse(input.stability, input.difficulty, r ?? 0, w);
    else card.stability = stabilityAfterSuccess(input.stability, input.difficulty, r ?? 0, grade, w);
    card.difficulty = nextDifficulty(input.difficulty, grade, w);

    if (input.state === 'learning') {
      intervalDays = applySteps(card, grade, params.learningSteps, now, params, rng);
    } else if (input.state === 'relearning') {
      intervalDays = applySteps(card, grade, params.relearningSteps, now, params, rng);
    } else if (grade === 1) {
      card.lapses += 1;
      if (params.relearningSteps.length > 0) {
        card.state = 'relearning';
        card.step = 0;
        card.due = now + params.relearningSteps[0] * MINUTE;
        intervalDays = (params.relearningSteps[0] * MINUTE) / DAY;
      } else {
        intervalDays = graduate(card, now, params, rng);
      }
    } else {
      intervalDays = graduate(card, now, params, rng);
    }
  }

  card.lastReview = now;
  card.reps += 1;
  return { card, elapsedDays, retrievability: r, intervalDays };
}

/** Preview the next due time for each grade (for showing "10m / 2d / 8d" on buttons). */
export function previewIntervals(card: SchedCard, now: number, params: FsrsParams = DEFAULT_PARAMS): Record<Grade, number> {
  const noFuzz = { ...params, enableFuzz: false };
  const out = {} as Record<Grade, number>;
  for (const g of [1, 2, 3, 4] as Grade[]) out[g] = reviewCard(card, g, now, noFuzz).card.due - now;
  return out;
}

export function formatInterval(ms: number): string {
  const min = Math.round(ms / MINUTE);
  if (min < 60) return `${Math.max(1, min)}m`;
  const hours = ms / (60 * MINUTE);
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
