import { useId, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  /** BCP-47 language of the expected answer (sets the input's lang for spellcheck/IME). */
  lang: string;
  label: string;
  placeholder?: string;
  accentKeys?: string[];
  submitLabel?: string;
  autoFocus?: boolean;
}

/** Typed-recall input (Enter submits) with tap-to-insert accent keys. */
export function AnswerInput({ value, onChange, onSubmit, lang, label, placeholder, accentKeys, submitLabel = 'Check', autoFocus = true }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();

  const insert = (ch: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  return (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="answer-row">
        <input
          id={id}
          ref={ref}
          className="answer-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          lang={lang}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          autoFocus={autoFocus}
        />
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
      {accentKeys && accentKeys.length > 0 ? (
        <div className="accent-keys" aria-label="Insert accented letters">
          {accentKeys.map((k) => (
            <button
              key={k}
              type="button"
              className="accent-key"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(k)}
              aria-label={`Insert ${k}`}
            >
              {k}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
