/**
 * Answer normalisation and auto-grading for typed recall.
 *
 * Principle 1: retrieval with feedback beats restudy (g = 0.73 with feedback vs 0.39 without),
 * and cued recall beats recognition. So the app grades TYPED answers and always shows the
 * correct form afterwards. The learner can override the suggested grade.
 */
import type { Grade } from './fsrs';

/** Lowercase, unify apostrophes, strip punctuation, collapse whitespace. Accents are kept. */
export function normalize(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    // Apostrophes only survive as elision marks (after a letter): l'amico, po'.
    .replace(/(^|[^\p{L}])'+/gu, '$1')
    // Treat "l'amico" and "l' amico" identically.
    .replace(/'\s*/g, "' ")
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Levenshtein distance over Unicode code points. */
export function levenshtein(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[t.length];
}

/** 0..1 similarity from edit distance. */
export function similarity(a: string, b: string): number {
  const len = Math.max(Array.from(a).length, Array.from(b).length);
  if (len === 0) return 1;
  return 1 - levenshtein(a, b) / len;
}

/**
 * Canonical form of an English answer: drops parenthetical notes ("you (formal)"),
 * a leading "to " (verbs) and a leading article, so "to be" = "be", "the house" = "house".
 */
export function canonicalEnglish(input: string): string {
  return normalize(input.replace(/\([^)]*\)/g, ' '))
    .replace(/^(to|the|a|an) (?=\S)/, '')
    .trim();
}

export type MatchKind = 'exact' | 'accent' | 'typo' | 'wrong';

export interface GradeResult {
  grade: Grade;
  kind: MatchKind;
  /** The accepted answer closest to the input (original spelling, for display). */
  expected: string;
}

export interface GradeOptions {
  /** Answers are English: canonicalise articles/"to", and accept any comma-separated part. */
  english?: boolean;
  /** Allow a single-character typo to count as Hard (default true). */
  allowTypo?: boolean;
}

/** Typos are only forgiven on answers long enough that one edit can't turn them into another word. */
const MIN_TYPO_LENGTH = 4;

/**
 * Auto-grade a typed answer:
 * - exact (after normalising case, whitespace, punctuation) → Good (3)
 * - correct except accents, or one-character typo → Hard (2), and the UI shows the exact spelling
 * - anything else → Again (1)
 * Easy (4) is only ever chosen by the learner.
 */
export function autoGrade(input: string, accepted: string[], opts: GradeOptions = {}): GradeResult {
  const allowTypo = opts.allowTypo ?? true;
  const canon = opts.english ? canonicalEnglish : normalize;
  const fallback: GradeResult = { grade: 1, kind: 'wrong', expected: accepted[0] ?? '' };
  if (accepted.length === 0) return fallback;

  const candidates = opts.english
    ? [input, ...input.split(/,|\/|;|\bor\b/)].map((s) => canon(s)).filter(Boolean)
    : [canon(input)].filter(Boolean);
  if (candidates.length === 0) return fallback;

  const targets = accepted.map((a) => ({ original: a, norm: canon(a) }));

  for (const t of targets) {
    if (candidates.includes(t.norm)) return { grade: 3, kind: 'exact', expected: t.original };
  }
  for (const t of targets) {
    const bare = stripAccents(t.norm);
    if (candidates.some((c) => stripAccents(c) === bare)) return { grade: 2, kind: 'accent', expected: t.original };
  }
  if (allowTypo) {
    for (const t of targets) {
      const bare = stripAccents(t.norm);
      if (Array.from(bare).length < MIN_TYPO_LENGTH) continue;
      if (candidates.some((c) => levenshtein(stripAccents(c), bare) <= 1)) {
        return { grade: 2, kind: 'typo', expected: t.original };
      }
    }
  }
  // Show the closest accepted answer so the feedback is as specific as possible.
  let best = targets[0];
  let bestSim = -1;
  for (const t of targets) {
    const sim = similarity(candidates[0], t.norm);
    if (sim > bestSim) {
      bestSim = sim;
      best = t;
    }
  }
  return { grade: 1, kind: 'wrong', expected: best.original };
}

/**
 * Strict check for grammar drills and sentence production, where one letter can be the
 * whole point (andato vs andata, e vs è). Accent-only mismatches are reported so the
 * feedback can say "check your accents", but they don't count as correct.
 */
export function checkStrict(input: string, accepted: string[]): { kind: 'exact' | 'accent' | 'wrong'; expected: string } {
  const n = normalize(input);
  if (!n) return { kind: 'wrong', expected: accepted[0] ?? '' };
  for (const a of accepted) if (normalize(a) === n) return { kind: 'exact', expected: a };
  for (const a of accepted) if (stripAccents(normalize(a)) === stripAccents(n)) return { kind: 'accent', expected: a };
  let best = accepted[0] ?? '';
  let bestSim = -1;
  for (const a of accepted) {
    const sim = similarity(n, normalize(a));
    if (sim > bestSim) {
      bestSim = sim;
      best = a;
    }
  }
  return { kind: 'wrong', expected: best };
}

export interface DiffToken {
  text: string;
  ok: boolean;
}

/**
 * Word-level diff of the expected answer against the learner's attempt, for highlighting
 * which words differ in the reveal. Returns the expected words, each marked ok / not ok.
 */
export function wordDiff(attempt: string, expected: string): DiffToken[] {
  const a = normalize(attempt).split(' ').filter(Boolean);
  const eWords = expected.split(/\s+/).filter(Boolean);
  const e = eWords.map((w) => normalize(w));
  // LCS table
  const dp: number[][] = Array.from({ length: e.length + 1 }, () => new Array<number>(a.length + 1).fill(0));
  for (let i = e.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      dp[i][j] = e[i] === a[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const okIdx = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < e.length && j < a.length) {
    if (e[i] === a[j]) {
      okIdx.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return eWords.map((w, idx) => ({ text: w, ok: okIdx.has(idx) }));
}
