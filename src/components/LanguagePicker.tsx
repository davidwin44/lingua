import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { languageList } from '../content';
import type { LanguagePack } from '../content/types';
import { hasProgress } from '../lib/storage';
import { useApp } from '../state/AppContext';
import { Flag } from './Flag';
import { Icon } from './Icon';

function describe(p: LanguagePack): string {
  return p.meta.status === 'preview' ? 'Preview: a first lesson, passage and word list' : 'A1 to A2 course';
}

/**
 * Choose the course: a dropdown of languages with their flags (the ARIA select-only
 * combobox pattern, so it works by keyboard and with screen readers). Each language keeps
 * its own progress, so switching is safe; a preview course is labelled as one.
 */
export function LanguagePicker({ onPick, label = 'Language' }: { onPick?: (code: string) => void; label?: string }) {
  const { pack, switchLanguage } = useApp();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const combo = useRef<HTMLDivElement>(null);
  const current = Math.max(0, languageList.findIndex((p) => p.meta.code === pack.meta.code));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(current);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const show = () => {
    setActive(current);
    setOpen(true);
  };

  const choose = (i: number) => {
    setOpen(false);
    combo.current?.focus();
    const code = languageList[i].meta.code;
    if (code === pack.meta.code) return;
    switchLanguage(code);
    onPick?.(code);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = languageList.length - 1;
    const keys: Record<string, () => void> = open
      ? {
          ArrowDown: () => setActive((a) => Math.min(a + 1, last)),
          ArrowUp: () => setActive((a) => Math.max(a - 1, 0)),
          Home: () => setActive(0),
          End: () => setActive(last),
          Enter: () => choose(active),
          ' ': () => choose(active),
          Escape: () => setOpen(false),
        }
      : { ArrowDown: show, ArrowUp: show, Enter: show, ' ': show };
    const act = keys[e.key];
    if (act) {
      e.preventDefault();
      act();
    } else if (e.key === 'Tab' && open) {
      setOpen(false);
    }
  };

  return (
    <div className="lang-picker" ref={root}>
      <span id={`${id}-label`} className="lang-picker-label">
        {label}
      </span>
      <div
        ref={combo}
        role="combobox"
        tabIndex={0}
        className="lang-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <Flag flag={pack.meta.flag} />
        <span id={`${id}-value`} className="lang-picker-value">
          {pack.meta.name}
        </span>
        {pack.meta.status === 'preview' ? <span className="lang-picker-status">Preview</span> : null}
        <Icon name="chevron" size={16} />
      </div>
      {open ? (
        <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="lang-picker-list">
          {languageList.map((p, i) => {
            const selected = i === current;
            const started = !selected && hasProgress(p.meta.code);
            return (
              <li
                key={p.meta.code}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={selected}
                className={`lang-option ${i === active ? 'is-active' : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <Flag flag={p.meta.flag} />
                <span className="lang-option-main">
                  <span className="lang-option-name">{p.meta.name}</span>
                  <span className="lang-option-sub">
                    {describe(p)}
                    {started ? '. You have progress here' : ''}
                  </span>
                </span>
                {selected ? <Icon name="check" size={16} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
