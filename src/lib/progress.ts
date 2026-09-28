/**
 * Pure progress operations: every function takes a Progress and returns a new one.
 *
 * Principle 10 (motivation): no daily streaks, no loss framing. Progress shown to the learner
 * is real learning — words known, coverage, measured retention, can-do statements.
 */
import type { CanDo, LanguagePack } from '../content/types';
import type { LexItem } from '../content/lexicon';
import { DAY as DAY_MS, DEFAULT_PARAMS, createCard, reviewCard, type FsrsParams, type Grade } from './fsrs';
import { DEFAULT_MODEL } from './claude';
import { dayKey, dayKeyToTs, weekKey, weekStart } from './dates';
import type { CardKind, CardRecord, CustomCard, Progress, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  desiredRetention: 0.9,
  newPerDay: 10,
  maxReviewsPerDay: 150,
  ttsRate: 0.9,
  voiceURI: null,
  apiKey: '',
  model: DEFAULT_MODEL,
};

/** A gap after which the next activity counts as a new session. */
const SESSION_GAP_MS = 30 * 60_000;
/** Cap per event so leaving the tab open doesn't inflate study time. */
const MAX_ACTIVITY_MS = 2 * 60_000;
/** After this long away, show a warm welcome-back with a capped catch-up. */
export const WELCOME_BACK_AFTER_MS = 3 * DAY_MS;
const MAX_LOG = 20_000;

export function createFreshProgress(now: number, lang = 'it'): Progress {
  return {
    version: 1,
    lang,
    createdAt: now,
    goal: null,
    settings: { ...DEFAULT_SETTINGS },
    cards: {},
    customCards: {},
    reviewLog: [],
    activity: {},
    lastActivityAt: null,
    lessonsCompleted: {},
    passagesCompleted: {},
    productionDone: {},
    scenariosDone: {},
    pronAttempts: [],
    welcomeBackDismissedAt: null,
  };
}

export function fsrsParams(settings: Settings): FsrsParams {
  return { ...DEFAULT_PARAMS, desiredRetention: settings.desiredRetention };
}

export function cardKind(cardId: string): CardKind {
  const prefix = cardId.slice(0, cardId.indexOf(':'));
  if (prefix === 'rec' || prefix === 'prod' || prefix === 'drill' || prefix === 'custom') return prefix;
  return 'custom';
}

export function cardRef(cardId: string): string {
  return cardId.slice(cardId.indexOf(':') + 1);
}

export function newCardRecord(id: string, now: number, priority = false): CardRecord {
  return { ...createCard(now), id, createdAt: now, introducedAt: null, graduatedAt: null, ...(priority ? { priority } : {}) };
}

/** Record study time; a gap of > 30 min starts a new session. */
export function recordActivity(p: Progress, now: number, ms: number, reviews = 0): Progress {
  const key = dayKey(now);
  const prev = p.activity[key] ?? { ms: 0, sessions: 0, reviews: 0 };
  const newSession = p.lastActivityAt == null || now - p.lastActivityAt > SESSION_GAP_MS;
  return {
    ...p,
    lastActivityAt: now,
    activity: {
      ...p.activity,
      [key]: {
        ms: prev.ms + Math.min(Math.max(ms, 0), MAX_ACTIVITY_MS),
        sessions: prev.sessions + (newSession ? 1 : 0),
        reviews: prev.reviews + reviews,
      },
    },
  };
}

/**
 * Apply a graded review to a card (creating it if needed), log it, and record activity.
 * The log keeps everything an FSRS optimiser would need later.
 */
export function applyReview(
  p: Progress,
  cardId: string,
  grade: Grade,
  now: number,
  opts: { rng?: () => number; activityMs?: number } = {},
): Progress {
  const before = p.cards[cardId] ?? newCardRecord(cardId, now);
  const outcome = reviewCard(before, grade, now, fsrsParams(p.settings), opts.rng ?? Math.random);
  const after: CardRecord = {
    ...before,
    ...outcome.card,
    introducedAt: before.introducedAt ?? now,
    graduatedAt: before.graduatedAt ?? (outcome.card.state === 'review' ? now : null),
  };
  delete after.priority;
  const log = [
    ...p.reviewLog,
    {
      cardId,
      timestamp: now,
      grade,
      elapsedDays: outcome.elapsedDays,
      stateBefore: before.state,
      S: after.stability,
      D: after.difficulty,
      R: outcome.retrievability,
    },
  ];
  const next: Progress = {
    ...p,
    cards: { ...p.cards, [cardId]: after },
    reviewLog: log.length > MAX_LOG ? log.slice(log.length - MAX_LOG) : log,
  };
  return recordActivity(next, now, opts.activityMs ?? 15_000, 1);
}

/**
 * A completed grammar drill becomes an FSRS cloze card, with the drill result as its first
 * grade (right first try → Good, after a prompt → Hard, never → Again). Repeating a lesson
 * later doesn't reschedule an existing card; that card's own reviews handle it.
 */
export function recordDrillResult(p: Progress, drillId: string, grade: Grade, now: number, activityMs = 20_000): Progress {
  const id = `drill:${drillId}`;
  if (p.cards[id]) return recordActivity(p, now, activityMs);
  return applyReview(p, id, grade, now, { activityMs });
}

/** Add a card to the deck as New (priority = introduced before the next frequency word). */
export function addCard(p: Progress, cardId: string, now: number, priority = true): Progress {
  if (p.cards[cardId]) return p;
  return { ...p, cards: { ...p.cards, [cardId]: newCardRecord(cardId, now, priority) } };
}

export function addCustomCard(
  p: Progress,
  card: Omit<CustomCard, 'id' | 'createdAt'>,
  now: number,
): { progress: Progress; id: string } {
  const existing = Object.values(p.customCards).find(
    (c) => c.front.toLowerCase() === card.front.toLowerCase() && c.direction === card.direction,
  );
  if (existing) return { progress: p, id: existing.id };
  const id = `c${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const withCard: Progress = { ...p, customCards: { ...p.customCards, [id]: { ...card, id, createdAt: now } } };
  return { progress: addCard(withCard, `custom:${id}`, now, true), id };
}

export function completeLesson(p: Progress, lessonId: string, score: number, total: number, now: number): Progress {
  return { ...p, lessonsCompleted: { ...p.lessonsCompleted, [lessonId]: { at: now, score, total } } };
}

export function completePassage(p: Progress, passageId: string, score: number, total: number, now: number): Progress {
  return { ...p, passagesCompleted: { ...p.passagesCompleted, [passageId]: { at: now, score, total } } };
}

export function markProduction(p: Progress, itemId: string, now: number): Progress {
  return { ...p, productionDone: { ...p.productionDone, [itemId]: now } };
}

export function markScenario(p: Progress, scenarioId: string, now: number): Progress {
  return { ...p, scenariosDone: { ...p.scenariosDone, [scenarioId]: now } };
}

/** Pronunciation attempts are logged for the weekly count only; they never touch FSRS. */
export function recordPronAttempt(p: Progress, now: number): Progress {
  const attempts = [...p.pronAttempts, now].slice(-2000);
  return recordActivity({ ...p, pronAttempts: attempts }, now, 10_000);
}

/** Group attempts into sessions (> 30 min gap = new session) and count those in the current week. */
export function pronSessionsThisWeek(p: Progress, now: number): number {
  const start = weekStart(now);
  let sessions = 0;
  let last = -Infinity;
  for (const t of [...p.pronAttempts].sort((a, b) => a - b)) {
    if (t - last > SESSION_GAP_MS && t >= start) sessions++;
    last = t;
  }
  return sessions;
}

export interface WeeklyProgress {
  minutes: number;
  sessions: number;
  value: number;
  target: number;
  fraction: number;
}

export function weeklyProgress(p: Progress, now: number): WeeklyProgress {
  const wk = weekKey(now);
  let ms = 0;
  let sessions = 0;
  for (const [key, a] of Object.entries(p.activity)) {
    if (weekKey(dayKeyToTs(key)) !== wk) continue;
    ms += a.ms;
    sessions += a.sessions;
  }
  const minutes = Math.round(ms / 60_000);
  const unit = p.goal?.unit ?? 'minutes';
  const target = Math.max(1, p.goal?.target ?? 60);
  const value = unit === 'minutes' ? minutes : sessions;
  return { minutes, sessions, value, target, fraction: Math.min(1, value / target) };
}

/** Number of distinct weeks with any study. Only ever counts up; never "lost". */
export function activeWeeks(p: Progress): number {
  const weeks = new Set<string>();
  for (const [key, a] of Object.entries(p.activity)) {
    if (a.ms > 0 || a.sessions > 0) weeks.add(weekKey(dayKeyToTs(key)));
  }
  return weeks.size;
}

export function shouldWelcomeBack(p: Progress, now: number): boolean {
  if (p.lastActivityAt == null || p.reviewLog.length === 0) return false;
  if (now - p.lastActivityAt < WELCOME_BACK_AFTER_MS) return false;
  return p.welcomeBackDismissedAt == null || p.welcomeBackDismissedAt < p.lastActivityAt;
}

/**
 * Measured retention: share of Review-state reviews in the last N days answered Hard or better.
 * Shown next to the target so learners can see spacing working.
 */
export function measuredRetention(p: Progress, now: number, days = 30): { rate: number | null; n: number } {
  const since = now - days * DAY_MS;
  let n = 0;
  let pass = 0;
  for (const e of p.reviewLog) {
    if (e.timestamp < since || e.stateBefore !== 'review') continue;
    n++;
    if (e.grade >= 2) pass++;
  }
  return { rate: n > 0 ? pass / n : null, n };
}

/** Lex items whose recognition card is in the Review state. */
export function knownLexItems(p: Progress, lexicon: LexItem[]): LexItem[] {
  return lexicon.filter((l) => p.cards[`rec:${l.id}`]?.state === 'review');
}

/** Lemmas the learner "knows" for coverage: lex items and custom cards in Review. */
export function knownLemmas(p: Progress, lexicon: LexItem[]): Set<string> {
  const set = new Set(knownLexItems(p, lexicon).map((l) => l.lemma.toLowerCase()));
  for (const c of Object.values(p.customCards)) {
    if (c.lemma && p.cards[`custom:${c.id}`]?.state === 'review') set.add(c.lemma.toLowerCase());
  }
  return set;
}

export function harmonic(n: number): number {
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return h;
}

/**
 * Estimated share of everyday running text covered by known words, using a Zipf model
 * (frequency ∝ 1/rank) calibrated so the top 1,000 lemmas cover ~80% of text.
 */
export function estimatedTextCoverage(known: LexItem[], zipfListSize: number): number {
  const total = harmonic(zipfListSize);
  const covered = known.reduce((sum, l) => sum + 1 / l.order, 0);
  return Math.min(1, covered / total);
}

export interface CanDoStatus {
  cando: CanDo;
  done: boolean;
  completed: number;
  total: number;
}

export function canDoStatus(p: Progress, pack: LanguagePack): CanDoStatus[] {
  return pack.cando.map((c) => {
    const checks = [
      ...(c.requires.lessons ?? []).map((id) => Boolean(p.lessonsCompleted[id])),
      ...(c.requires.passages ?? []).map((id) => Boolean(p.passagesCompleted[id])),
      ...(c.requires.production ?? []).map((id) => Boolean(p.productionDone[id])),
    ];
    const completed = checks.filter(Boolean).length;
    return { cando: c, done: completed === checks.length && checks.length > 0, completed, total: checks.length };
  });
}
