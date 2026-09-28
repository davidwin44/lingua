import { useEffect, useRef } from 'react';
import type { GlossEntry } from '../content/types';
import { useApp } from '../state/AppContext';
import { addCard, addCustomCard } from '../lib/progress';
import { SpeakButton } from './SpeakButton';
import { Icon } from './Icon';

/**
 * Tap-to-gloss popover: lemma, translation, audio, and "Add to my deck" — a content card if
 * the lemma is in the pack's word list, otherwise a custom card.
 */
export function WordPopover({ surface, gloss, onClose }: { surface: string; gloss: GlossEntry | undefined; onClose: () => void }) {
  const { lexicon, progress, update, pack } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lemma = gloss?.lemma ?? surface;
  const lex = lexicon.find((l) => l.lemma.toLowerCase() === lemma.toLowerCase());
  const lexCardId = lex ? `rec:${lex.id}` : null;
  const custom = Object.values(progress.customCards).find((c) => c.direction === 'rec' && c.front.toLowerCase() === lemma.toLowerCase());
  const inDeck = lexCardId ? Boolean(progress.cards[lexCardId]) : Boolean(custom);
  const known = lexCardId ? progress.cards[lexCardId]?.state === 'review' : false;

  const add = () => {
    if (lexCardId) update((p, now) => addCard(p, lexCardId, now, true));
    else if (gloss) {
      update((p, now) => addCustomCard(p, { front: lemma, back: gloss.en, direction: 'rec', lemma, source: 'passage' }, now).progress);
    }
  };

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover" role="dialog" aria-modal="true" aria-label={`Word: ${surface}`} onClick={(e) => e.stopPropagation()}>
        <div className="popover-head">
          <div>
            <p className="popover-word" lang={pack.meta.ttsLang}>
              {surface}
            </p>
            {gloss && lemma.toLowerCase() !== surface.toLowerCase().replace(/'$/, '') ? (
              <p className="muted small">
                from <span lang={pack.meta.ttsLang}>{lemma}</span>
              </p>
            ) : null}
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <p className="popover-en">{gloss?.en ?? 'No translation available.'}</p>
        <div className="row-wrap">
          <SpeakButton text={surface.replace(/'$/, '')} label="Listen" />
          {gloss?.proper ? (
            <span className="muted small">Name / place</span>
          ) : inDeck ? (
            <span className="tag tag-ok">{known ? 'Known' : 'In your deck'}</span>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!gloss}>
              Add to my deck
            </button>
          )}
        </div>
        {!inDeck && !gloss?.proper ? <p className="muted small">It will come up before your next new word.</p> : null}
      </div>
    </div>
  );
}
