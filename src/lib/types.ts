import type { CardState, Grade, SchedCard } from './fsrs';

/**
 * Card ids:
 *   rec:<lexId>     recognition (see L2, type English)
 *   prod:<lexId>    production (see English, type L2) — unlocked after rec graduates
 *   drill:<drillId> grammar cloze card, created when a drill item is completed
 *   custom:<id>     learner-added card (tap-to-gloss, tutor corrections)
 */
export type CardKind = 'rec' | 'prod' | 'drill' | 'custom';

export interface CardRecord extends SchedCard {
  id: string;
  createdAt: number;
  /** First time this card was studied (left the New state). */
  introducedAt: number | null;
  /** First time this card reached the Review state. */
  graduatedAt: number | null;
  /** Learner-added: introduced before the next frequency-ordered word. */
  priority?: boolean;
}

export interface ReviewLogEntry {
  cardId: string;
  timestamp: number;
  grade: Grade;
  elapsedDays: number;
  stateBefore: CardState;
  /** Stability and difficulty after the review. */
  S: number;
  D: number;
  /** Retrievability at review time (null for a new card). */
  R: number | null;
}

export interface CustomCard {
  id: string;
  /** Text shown as the cue. */
  front: string;
  /** Accepted answer(s), displayed after answering. */
  back: string;
  /** 'rec': front is L2, answer in English. 'prod': front is English/prompt, answer in L2. */
  direction: 'rec' | 'prod';
  lemma?: string;
  note?: string;
  createdAt: number;
  source: 'passage' | 'tutor' | 'manual';
}

export type GoalReason = 'travel' | 'family' | 'work' | 'study' | 'fun';

export interface Goal {
  reason: GoalReason;
  unit: 'minutes' | 'sessions';
  target: number;
}

export interface Settings {
  desiredRetention: number;
  newPerDay: number;
  maxReviewsPerDay: number;
  ttsRate: number;
  voiceURI: string | null;
  apiKey: string;
  model: string;
}

export interface DayActivity {
  ms: number;
  sessions: number;
  reviews: number;
}

export interface Completion {
  at: number;
  score: number;
  total: number;
}

export interface Progress {
  version: 1;
  lang: string;
  createdAt: number;
  /** null until onboarding is complete. */
  goal: Goal | null;
  settings: Settings;
  cards: Record<string, CardRecord>;
  customCards: Record<string, CustomCard>;
  reviewLog: ReviewLogEntry[];
  /** Keyed by study-day "YYYY-MM-DD". */
  activity: Record<string, DayActivity>;
  lastActivityAt: number | null;
  lessonsCompleted: Record<string, Completion>;
  passagesCompleted: Record<string, Completion>;
  productionDone: Record<string, number>;
  scenariosDone: Record<string, number>;
  /** Timestamps of pronunciation attempts. */
  pronAttempts: number[];
  welcomeBackDismissedAt: number | null;
}
