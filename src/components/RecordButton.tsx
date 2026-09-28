import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { recordPronAttempt } from '../lib/progress';
import {
  VERDICT_LABEL,
  recognizeOnce,
  scorePronunciation,
  srSupported,
  type PronResult,
  type RecognitionHandle,
} from '../lib/speech';
import { Icon } from './Icon';

/**
 * "Record" → SpeechRecognition → per-word feedback. Pronunciation results are for practice
 * only and NEVER change FSRS grades. Renders nothing when speech recognition is unsupported
 * (pages that centre on speaking show SR_UNSUPPORTED_MESSAGE instead).
 */
export function RecordButton({ target, label = 'Record', compact = false }: { target: string; label?: string; compact?: boolean }) {
  const { pack, update } = useApp();
  const [status, setStatus] = useState<'idle' | 'listening' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<PronResult | null>(null);
  const [error, setError] = useState('');
  const handle = useRef<RecognitionHandle | null>(null);

  useEffect(() => () => handle.current?.stop(), []);

  if (!srSupported()) return null;

  const start = async () => {
    if (status === 'listening') {
      handle.current?.stop();
      return;
    }
    setStatus('listening');
    setError('');
    const h = recognizeOnce(pack.meta.srLang, 3);
    handle.current = h;
    try {
      const alternatives = await h.promise;
      setResult(scorePronunciation(target, alternatives));
      setStatus('done');
      update((p, now) => recordPronAttempt(p, now));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setStatus('error');
    }
  };

  return (
    <div className="record">
      <button
        type="button"
        className={`btn ${compact ? 'btn-link' : 'btn-ghost'} btn-sm ${status === 'listening' ? 'is-recording' : ''}`}
        onClick={start}
        aria-pressed={status === 'listening'}
      >
        {compact ? null : <Icon name="mic" size={16} />}
        <span>{status === 'listening' ? 'Listening… tap to stop' : label}</span>
      </button>
      {status === 'error' ? (
        <p className="muted small" role="status">
          {error}
        </p>
      ) : null}
      {status === 'done' && result ? <PronFeedback result={result} /> : null}
    </div>
  );
}

export function PronFeedback({ result }: { result: PronResult }) {
  return (
    <div className={`pron-result verdict-${result.verdict}`} role="status">
      <div className="pron-head">
        <strong>{VERDICT_LABEL[result.verdict]}</strong>
        <span className="pron-score">{Math.round(result.score * 100)}%</span>
      </div>
      <p className="pron-words" aria-label="Word-by-word match">
        {result.words.map((w, i) => (
          <span key={i} className={w.match ? 'w-ok' : 'w-bad'} title={w.match ? 'Matched' : `Heard: ${w.heard ?? 'nothing'}`}>
            {w.expected ?? `(+${w.heard})`}
          </span>
        ))}
      </p>
      {result.feedback.length > 0 ? (
        <ul className="pron-feedback">
          {result.feedback.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : null}
      <p className="muted small">Heard “{result.heard || '…'}”. This doesn’t affect your review grades.</p>
    </div>
  );
}
