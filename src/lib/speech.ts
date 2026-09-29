/**
 * Pronunciation practice with SpeechRecognition / webkitSpeechRecognition.
 *
 * Research basis: ASR pronunciation training g = 0.69; explicit corrective feedback (0.86)
 * beats transcription-only (0.50); individual sounds (0.82) beat prosody (0.37); gains need
 * 5-8 weeks of steady practice. Recognition error is much higher on accented speech, so
 * thresholds are lenient and results NEVER change FSRS grades.
 */
import { levenshtein, normalize, stripAccents } from './grading';

interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

export function getRecognitionCtor(): RecognitionCtor | null {
  try {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  } catch {
    return null;
  }
}

export function srSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export const SR_UNSUPPORTED_MESSAGE =
  'Speech recognition isn’t available in this browser. Pronunciation checks work in Chrome and Edge (desktop and Android). You can still listen and repeat aloud.';

export function friendlySrError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow the microphone for this page and try again.';
    case 'no-speech':
      return 'I didn’t hear anything. Try again a little closer to the microphone.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'Speech recognition needs a network connection in this browser.';
    case 'aborted':
      return 'Recording stopped.';
    default:
      return 'Something went wrong with speech recognition. Try again.';
  }
}

export interface RecognitionHandle {
  promise: Promise<string[]>;
  stop(): void;
}

/** Listen once (lang e.g. "it-IT", interimResults false, maxAlternatives 3). Resolves with transcripts. */
export function recognizeOnce(lang: string, maxAlternatives = 3): RecognitionHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return { promise: Promise.reject(new Error(SR_UNSUPPORTED_MESSAGE)), stop: () => undefined };
  let rec: Recognition;
  try {
    rec = new Ctor();
  } catch {
    return { promise: Promise.reject(new Error(SR_UNSUPPORTED_MESSAGE)), stop: () => undefined };
  }
  const promise = new Promise<string[]>((resolve, reject) => {
    let settled = false;
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = maxAlternatives;
    rec.continuous = false;
    rec.onresult = (e) => {
      settled = true;
      const first = e.results[0];
      const alts: string[] = [];
      for (let i = 0; i < (first?.length ?? 0); i++) alts.push(first[i].transcript);
      resolve(alts);
    };
    rec.onerror = (e) => {
      if (settled) return;
      settled = true;
      reject(new Error(friendlySrError(e.error)));
    };
    rec.onend = () => {
      if (!settled) {
        settled = true;
        reject(new Error(friendlySrError('no-speech')));
      }
    };
    try {
      rec.start();
    } catch {
      settled = true;
      reject(new Error('Could not start the microphone. Try again.'));
    }
  });
  return {
    promise,
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

export type PronVerdict = 'clear' | 'close' | 'missed';

export interface WordMatch {
  expected: string | null;
  heard: string | null;
  match: boolean;
}

export interface PronResult {
  /** 0..1 */
  score: number;
  verdict: PronVerdict;
  heard: string;
  words: WordMatch[];
  feedback: string[];
}

/** Lenient thresholds: ≥ 80% Clear, 50-80% Close, < 50% Didn't catch that. */
export function verdictFor(score: number): PronVerdict {
  if (score >= 0.8) return 'clear';
  if (score >= 0.5) return 'close';
  return 'missed';
}

export const VERDICT_LABEL: Record<PronVerdict, string> = {
  clear: 'Clear',
  close: 'Close, try again',
  missed: 'Didn’t catch that',
};

function charSimilarity(a: string, b: string): number {
  const len = Math.max(Array.from(a).length, Array.from(b).length);
  return len === 0 ? 1 : 1 - levenshtein(a, b) / len;
}

/** Align expected and heard word sequences (edit-distance alignment). */
export function alignWords(expected: string[], heard: string[]): WordMatch[] {
  const n = expected.length;
  const m = heard.length;
  const cost = (i: number, j: number) => (expected[i] === heard[j] ? 0 : 1 - 0.5 * charSimilarity(expected[i], heard[j]));
  const dp: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(i - 1, j - 1));
    }
  }
  const out: WordMatch[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + cost(i - 1, j - 1)) {
      out.push({ expected: expected[i - 1], heard: heard[j - 1], match: expected[i - 1] === heard[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      out.push({ expected: expected[i - 1], heard: null, match: false });
      i--;
    } else {
      out.push({ expected: null, heard: heard[j - 1], match: false });
      j--;
    }
  }
  return out.reverse();
}

const VOWELS = 'aeiouàèéìíòóùú';

/**
 * Specific, explicit feedback for one mismatched word. The accent rule applies to every
 * language; the consonant and final-vowel rules are Italian and run only for `lang` "it".
 */
export function explainMismatch(expected: string, heard: string, lang = 'it'): string {
  const quote = `heard “${heard}”, expected “${expected}”`;
  if (stripAccents(expected) === stripAccents(heard)) {
    // Italian and Spanish accents mark stress; French accents mark vowel quality.
    if (lang === 'fr') return `${quote}: check the accented vowel`;
    const last = Array.from(expected).pop() ?? '';
    return stripAccents(last) !== last ? `${quote}: stress the final vowel` : `${quote}: check the stressed (accented) vowel`;
  }
  if (lang !== 'it') return quote;
  const doubled = expected.match(/([bcdfglmnprstvz])\1/);
  if (doubled && heard === expected.replace(doubled[0], doubled[1])) {
    return `${quote}: hold the double “${doubled[0]}” a little longer`;
  }
  const single = heard.match(/([bcdfglmnprstvz])\1/);
  if (single && expected === heard.replace(single[0], single[1])) {
    return `${quote}: keep the “${single[1]}” short; it’s a single consonant`;
  }
  if (expected.includes('gli') && !heard.includes('gli')) return `${quote}: for “gli”, press the tongue flat to the palate, with no hard g`;
  if (expected.includes('gn') && !heard.includes('gn')) return `${quote}: “gn” is one sound, like “ny” in canyon`;
  if (/ch[ei]/.test(expected) && !/ch[ei]/.test(heard)) return `${quote}: “ch” before e/i is a hard “k”`;
  if (/gh[ei]/.test(expected) && !/gh[ei]/.test(heard)) return `${quote}: “gh” before e/i is a hard “g”`;
  if (/sc[ei]/.test(expected) && !/sc[ei]/.test(heard)) return `${quote}: “sc” before e/i sounds like “sh”`;
  const endV = Array.from(expected).pop() ?? '';
  const heardEnd = Array.from(heard).pop() ?? '';
  if (VOWELS.includes(endV) && VOWELS.includes(heardEnd) && endV !== heardEnd && expected.slice(0, -1) === heard.slice(0, -1)) {
    return `${quote}: pronounce the final “${endV}” clearly; Italian doesn’t drop final vowels`;
  }
  return quote;
}

/** Score the best-matching alternative against the target. */
export function scorePronunciation(target: string, alternatives: string[], lang = 'it'): PronResult {
  const normTarget = normalize(target);
  const tWords = normTarget.split(' ').filter(Boolean);
  let best: PronResult | null = null;
  for (const alt of alternatives.length > 0 ? alternatives : ['']) {
    const normHeard = normalize(alt);
    const score = charSimilarity(normTarget, normHeard);
    if (best && score <= best.score) continue;
    const words = alignWords(tWords, normHeard.split(' ').filter(Boolean));
    const feedback: string[] = [];
    for (const w of words) {
      if (w.match) continue;
      if (w.expected && w.heard) feedback.push(explainMismatch(w.expected, w.heard, lang));
      else if (w.expected) feedback.push(`“${w.expected}” wasn’t picked up; say it clearly`);
    }
    best = { score, verdict: verdictFor(score), heard: alt, words, feedback: feedback.slice(0, 3) };
  }
  return best as PronResult;
}
