/**
 * Text-to-speech via the Web Speech API (speechSynthesis). Feature-detected; every call is
 * a no-op returning false when unsupported, so callers never crash.
 */

export function ttsSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  } catch {
    return false;
  }
}

export function listVoices(lang?: string): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  try {
    const all = window.speechSynthesis.getVoices();
    if (!lang) return all;
    const base = lang.slice(0, 2).toLowerCase();
    return all.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base));
  } catch {
    return [];
  }
}

/** Prefer the learner's chosen voice, then an exact locale match, then any voice for the language. */
export function pickVoice(lang: string, preferredURI?: string | null): SpeechSynthesisVoice | null {
  const voices = listVoices(lang);
  if (voices.length === 0) return null;
  if (preferredURI) {
    const chosen = voices.find((v) => v.voiceURI === preferredURI);
    if (chosen) return chosen;
  }
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pool = exact.length > 0 ? exact : voices;
  return pool.find((v) => v.localService) ?? pool[0];
}

export interface SpeakOptions {
  lang: string;
  rate?: number;
  voiceURI?: string | null;
  onEnd?: () => void;
  onError?: () => void;
  /** Queue after whatever is currently speaking instead of interrupting it. */
  queue?: boolean;
}

export function speak(text: string, opts: SpeakOptions): boolean {
  if (!ttsSupported() || !text.trim()) return false;
  try {
    const synth = window.speechSynthesis;
    if (!opts.queue) synth.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = opts.lang;
    u.rate = opts.rate ?? 0.9;
    const voice = pickVoice(opts.lang, opts.voiceURI);
    if (voice) u.voice = voice;
    if (opts.onEnd) u.onend = () => opts.onEnd?.();
    u.onerror = () => (opts.onError ?? opts.onEnd)?.();
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Voices load asynchronously in most browsers; subscribe to be told when they arrive. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!ttsSupported()) return () => undefined;
  try {
    const synth = window.speechSynthesis;
    synth.addEventListener?.('voiceschanged', cb);
    return () => synth.removeEventListener?.('voiceschanged', cb);
  } catch {
    return () => undefined;
  }
}
