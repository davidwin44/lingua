import { useState, type ReactNode } from 'react';
import type { Grade } from '../lib/fsrs';
import { checkStrict, wordDiff } from '../lib/grading';
import { AnswerInput } from './AnswerInput';
import { SpeakButton } from './SpeakButton';
import { RecordButton } from './RecordButton';

export interface DrillResult {
  /** Right first try → Good (3); right after a prompt → Hard (2); never right → Again (1). */
  grade: Grade;
  solved: boolean;
  wrongAttempts: number;
}

interface Props {
  prompt: ReactNode;
  subPrompt?: ReactNode;
  accepted: string[];
  /** [metalinguistic prompt, narrower prompt]. */
  hints: [string, string];
  explanation: string;
  options?: string[];
  justify?: { question: string; options: string[]; answerIndex: number };
  /** BCP-47 language of the answer. */
  lang: string;
  accentKeys?: string[];
  /** Highlight words that differ between the learner's last attempt and the answer. */
  showDiff?: boolean;
  /** Target-language text to offer for listening / saying aloud after the reveal. */
  sayText?: string;
  continueLabel?: string;
  onComplete: (result: DrillResult) => void;
}

/** Wrong attempts allowed before the answer is revealed: prompt, narrower prompt, then reveal. */
export const MAX_WRONG = 3;

/**
 * Prompt-first corrective feedback (Principle 6; Lyster & Saito 2010: prompts > recasts):
 *   1st wrong attempt → metalinguistic prompt (hints[0]); the answer is NOT shown; retry.
 *   2nd wrong attempt → narrower prompt (hints[1]); one more retry.
 *   3rd wrong attempt → reveal the answer with the rule explanation.
 */
export function PromptedDrill({
  prompt,
  subPrompt,
  accepted,
  hints,
  explanation,
  options,
  justify,
  lang,
  accentKeys,
  showDiff,
  sayText,
  continueLabel = 'Continue',
  onComplete,
}: Props) {
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(0);
  const [status, setStatus] = useState<'answering' | 'solved' | 'revealed'>('answering');
  const [lastAttempt, setLastAttempt] = useState('');
  const [accentSlip, setAccentSlip] = useState(false);
  const [triedOptions, setTriedOptions] = useState<string[]>([]);
  const [justifyPick, setJustifyPick] = useState<number | null>(null);

  const submit = (value: string) => {
    if (status !== 'answering' || !value.trim()) return;
    const r = checkStrict(value, accepted);
    setLastAttempt(value);
    if (r.kind === 'exact') {
      setStatus('solved');
      return;
    }
    const n = wrong + 1;
    setWrong(n);
    setAccentSlip(r.kind === 'accent');
    if (options) setTriedOptions((t) => [...t, value]);
    if (n >= MAX_WRONG) setStatus('revealed');
  };

  const giveUpStep = () => {
    // "Not sure" counts as an attempt so the prompts still come before the answer.
    const n = wrong + 1;
    setWrong(n);
    setAccentSlip(false);
    if (n >= MAX_WRONG) setStatus('revealed');
  };

  const grade: Grade = status === 'solved' ? (wrong === 0 ? 3 : 2) : 1;
  const finished = status !== 'answering';
  const answer = accepted[0];

  return (
    <div className="drill">
      <div className="drill-prompt" lang={lang}>
        {prompt}
      </div>
      {subPrompt ? <p className="drill-sub muted">{subPrompt}</p> : null}

      {!finished ? (
        <>
          {wrong > 0 ? (
            <div className="hint-box" role="status" aria-live="polite">
              <p className="hint-label">{wrong === 1 ? 'Hint' : 'Second hint'}</p>
              {accentSlip ? <p>Check the accents.</p> : null}
              <p>{hints[Math.min(wrong, 2) - 1]}</p>
              {lastAttempt ? <p className="muted small">You wrote “{lastAttempt}”</p> : null}
            </div>
          ) : null}

          {options ? (
            <div className="options" role="group" aria-label="Choose an answer">
              {options.map((o) => (
                <button key={o} type="button" className="btn btn-option" disabled={triedOptions.includes(o)} onClick={() => submit(o)} lang={lang}>
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <AnswerInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              lang={lang}
              label="Your answer"
              placeholder={wrong > 0 ? 'Try again…' : 'Type your answer'}
              accentKeys={accentKeys}
              submitLabel={wrong > 0 ? 'Try again' : 'Check'}
            />
          )}
          <button type="button" className="btn btn-link" onClick={giveUpStep}>
            {wrong === MAX_WRONG - 1 ? 'Show answer' : 'Hint'}
          </button>
        </>
      ) : (
        <div className={`result-box ${status === 'solved' ? 'is-correct' : 'is-revealed'}`} role="status" aria-live="polite">
          <p className="result-title">
            {status === 'solved' ? (wrong === 0 ? 'Correct' : 'Correct after a hint') : 'Answer'}
          </p>
          <p className="result-answer" lang={lang} data-testid="revealed-answer">
            {showDiff && lastAttempt && status === 'revealed'
              ? wordDiff(lastAttempt, answer).map((w, i) => (
                  <span key={i} className={w.ok ? 'w-ok' : 'w-diff'}>
                    {w.text}{' '}
                  </span>
                ))
              : answer}
          </p>
          {showDiff && lastAttempt && status === 'revealed' ? (
            <p className="muted small">
              Underlined words differ from your last try, “{lastAttempt}”.
            </p>
          ) : null}
          {accepted.length > 1 ? <p className="muted small">Also accepted: {accepted.slice(1).join(' · ')}</p> : null}
          <p className="explanation">{explanation}</p>

          {justify ? (
            <div className="justify">
              <p className="justify-q">{justify.question}</p>
              <div className="options">
                {justify.options.map((o, i) => (
                  <button
                    key={o}
                    type="button"
                    className={`btn btn-option ${justifyPick !== null && i === justify.answerIndex ? 'is-right' : ''} ${justifyPick === i && i !== justify.answerIndex ? 'is-wrong' : ''}`}
                    onClick={() => setJustifyPick(i)}
                    disabled={justifyPick !== null}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {justifyPick !== null ? (
                <p className="small">{justifyPick === justify.answerIndex ? 'Right.' : `The rule: ${justify.options[justify.answerIndex]}.`}</p>
              ) : null}
            </div>
          ) : null}

          {sayText ? (
            <div className="say-row">
              <SpeakButton text={sayText} label="Listen" />
              <RecordButton target={sayText} label="Say it" />
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-primary"
            autoFocus
            onClick={() => onComplete({ grade, solved: status === 'solved', wrongAttempts: wrong })}
          >
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}
