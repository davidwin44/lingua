import { languageList } from '../content';
import { hasProgress } from '../lib/storage';
import { useApp } from '../state/AppContext';

/**
 * Choose the course. Each language keeps its own progress, so switching is safe; a preview
 * course is labelled as one, so nobody mistakes starter content for a full course.
 */
export function LanguagePicker({ onPick }: { onPick?: (code: string) => void }) {
  const { pack, switchLanguage } = useApp();
  return (
    <div className="choice-list" role="radiogroup" aria-label="Language">
      {languageList.map((p) => {
        const { code, name, status } = p.meta;
        const current = code === pack.meta.code;
        const started = !current && hasProgress(code);
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={current}
            className={`choice ${current ? 'is-selected' : ''}`}
            onClick={() => {
              switchLanguage(code);
              onPick?.(code);
            }}
          >
            <span className="choice-dot" aria-hidden="true" />
            <span className="choice-body">
              <span className="choice-title">{name}</span>
              <span className="muted small">
                {status === 'preview' ? 'Preview: a first lesson, passage and word list while the course is written' : 'A1 to A2 course'}
                {started ? '. You have progress here' : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
