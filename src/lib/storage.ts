/**
 * localStorage persistence behind a versioned key, with try/catch around every access.
 * Corrupted or unreadable data falls back to a fresh state; nothing here ever throws
 * except importProgress, which reports a friendly error for bad files.
 */
import { DEFAULT_SETTINGS, createFreshProgress } from './progress';
import type { Progress } from './types';

export const STORAGE_KEY = 'lingua:v1';
const EXPORT_APP = 'lingua';

export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): KVStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Merge unknown JSON into a well-formed Progress, or return null if it isn't one of ours. */
export function sanitizeProgress(raw: unknown, now: number): Progress | null {
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.cards)) return null;
  const fresh = createFreshProgress(now, typeof raw.lang === 'string' ? raw.lang : 'it');
  const s = isObj(raw.settings) ? raw.settings : {};
  const goal = isObj(raw.goal) ? raw.goal : null;

  const cards: Progress['cards'] = {};
  for (const [id, c] of Object.entries(raw.cards)) {
    if (!isObj(c) || typeof c.state !== 'string' || !['new', 'learning', 'review', 'relearning'].includes(c.state)) continue;
    cards[id] = {
      id,
      state: c.state as Progress['cards'][string]['state'],
      step: num(c.step, 0),
      stability: num(c.stability, 0),
      difficulty: num(c.difficulty, 0),
      due: num(c.due, now),
      lastReview: typeof c.lastReview === 'number' ? c.lastReview : null,
      reps: num(c.reps, 0),
      lapses: num(c.lapses, 0),
      createdAt: num(c.createdAt, now),
      introducedAt: typeof c.introducedAt === 'number' ? c.introducedAt : null,
      graduatedAt: typeof c.graduatedAt === 'number' ? c.graduatedAt : null,
      ...(c.priority === true ? { priority: true } : {}),
    };
  }

  return {
    ...fresh,
    createdAt: num(raw.createdAt, now),
    goal:
      goal && typeof goal.reason === 'string' && (goal.unit === 'minutes' || goal.unit === 'sessions')
        ? { reason: goal.reason as NonNullable<Progress['goal']>['reason'], unit: goal.unit, target: clamp(num(goal.target, 60), 1, 10_000) }
        : null,
    settings: {
      desiredRetention: clamp(num(s.desiredRetention, DEFAULT_SETTINGS.desiredRetention), 0.8, 0.95),
      newPerDay: clamp(Math.round(num(s.newPerDay, DEFAULT_SETTINGS.newPerDay)), 0, 30),
      maxReviewsPerDay: clamp(Math.round(num(s.maxReviewsPerDay, DEFAULT_SETTINGS.maxReviewsPerDay)), 10, 1000),
      ttsRate: clamp(num(s.ttsRate, DEFAULT_SETTINGS.ttsRate), 0.6, 1.1),
      voiceURI: typeof s.voiceURI === 'string' ? s.voiceURI : null,
      apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
      model: typeof s.model === 'string' && s.model.trim() ? s.model : DEFAULT_SETTINGS.model,
    },
    cards,
    customCards: isObj(raw.customCards) ? (raw.customCards as Progress['customCards']) : {},
    reviewLog: Array.isArray(raw.reviewLog) ? (raw.reviewLog.filter(isObj) as unknown as Progress['reviewLog']) : [],
    activity: isObj(raw.activity) ? (raw.activity as Progress['activity']) : {},
    lastActivityAt: typeof raw.lastActivityAt === 'number' ? raw.lastActivityAt : null,
    lessonsCompleted: isObj(raw.lessonsCompleted) ? (raw.lessonsCompleted as Progress['lessonsCompleted']) : {},
    passagesCompleted: isObj(raw.passagesCompleted) ? (raw.passagesCompleted as Progress['passagesCompleted']) : {},
    productionDone: isObj(raw.productionDone) ? (raw.productionDone as Progress['productionDone']) : {},
    scenariosDone: isObj(raw.scenariosDone) ? (raw.scenariosDone as Progress['scenariosDone']) : {},
    pronAttempts: Array.isArray(raw.pronAttempts) ? raw.pronAttempts.filter((t): t is number => typeof t === 'number') : [],
    welcomeBackDismissedAt: typeof raw.welcomeBackDismissedAt === 'number' ? raw.welcomeBackDismissedAt : null,
  };
}

export function loadProgress(storage: KVStorage | null = browserStorage(), now = Date.now()): Progress {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return createFreshProgress(now);
    return sanitizeProgress(JSON.parse(text), now) ?? createFreshProgress(now);
  } catch {
    return createFreshProgress(now);
  }
}

export function saveProgress(p: Progress, storage: KVStorage | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(storage: KVStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportProgress(p: Progress, now = Date.now()): string {
  return JSON.stringify({ app: EXPORT_APP, exportedAt: new Date(now).toISOString(), progress: p }, null, 2);
}

/** Parse an export file. Throws an Error with a learner-friendly message if it isn't valid. */
export function importProgress(text: string, now = Date.now()): Progress {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON. Choose a file exported from this app's Settings page.");
  }
  const candidate = isObj(raw) && raw.app === EXPORT_APP && isObj(raw.progress) ? raw.progress : raw;
  const p = sanitizeProgress(candidate, now);
  if (!p) throw new Error("That file doesn't look like a Lingua progress export.");
  return p;
}
