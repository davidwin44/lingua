import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { installState, subscribeInstall, type InstallState } from '../lib/install';
import { useApp } from './AppContext';
import { speak, stopSpeaking, ttsSupported } from '../lib/tts';
import { onVoicesChanged, listVoices } from '../lib/tts';

/** Current time, refreshed every `intervalMs` (for due-time countdowns). */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Speak target-language text with the learner's voice and rate settings. */
export function useSpeak() {
  const { pack, progress } = useApp();
  const { ttsRate, voiceURI } = progress.settings;
  return useCallback(
    (text: string, opts: { onEnd?: () => void; rate?: number } = {}) =>
      speak(text, { lang: pack.meta.ttsLang, rate: opts.rate ?? ttsRate, voiceURI, onEnd: opts.onEnd }),
    [pack.meta.ttsLang, ttsRate, voiceURI],
  );
}

export { stopSpeaking, ttsSupported };

/** Voices for the pack language; re-reads when the browser finishes loading voices. */
export function useVoices(lang: string): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices(lang));
  useEffect(() => {
    setVoices(listVoices(lang));
    return onVoicesChanged(() => setVoices(listVoices(lang)));
  }, [lang]);
  return voices;
}

/** Stop any speech when a page unmounts. */
export function useStopSpeechOnUnmount() {
  useEffect(() => () => stopSpeaking(), []);
}

/** Whether the app can be installed as a desktop app right now. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribeInstall, installState, () => 'unavailable');
}
