import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DrillRef, LexItem } from '../content/lexicon';
import type { LanguagePack } from '../content/types';
import { GRADE_LABELS, formatInterval, previewIntervals, type Grade } from '../lib/fsrs';
import { autoGrade, type GradeResult } from '../lib/grading';
import { cardKind, cardRef, fsrsParams, newCardRecord } from '../lib/progress';
import type { CardKind, CustomCard, Progress } from '../lib/types';
import { AnswerInput } from './AnswerInput';
import { RecordButton } from './RecordButton';
import { SpeakButton } from './SpeakButton';

export interface CardModel {
  id: string;
  kind: CardKind;
  /** Which language the learner must type. */
  answerLang: 'l2' | 'en';
  cue: string;
  cueIsL2: boolean;
  cueSub?: string;
  cueHint?: string;
  accepted: string[];
  options?: string[];
  /** Target-language text for TTS / say-aloud. */
  sayText?: string;
  lex?: LexItem;
  drill?: DrillRef;
  custom?: CustomCard;
}

const POS_LABEL: Record<string, string> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  art: 'article',
  num: 'number',
  interj: 'expression',
  det: 'determiner',
};

/** Full sentence for a cloze drill: fill the gap and drop "(parlare)"-style cues. */
export function drillSentence(ref: DrillRef): string | undefined {
  const d = ref.drill;
  if (d.type === 'transform') return d.answer[0];
  if (!d.prompt.includes('___')) return undefined;
  return d.prompt
    .replace('___', d.answer[0])
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
}

export function buildCardModel(
  cardId: string,
  ctx: { lexMap: Map<string, LexItem>; drills: Map<string, DrillRef>; progress: Progress },
): CardModel | null {
  const kind = cardKind(cardId);
  const ref = cardRef(cardId);
  if (kind === 'rec' || kind === 'prod') {
    const lex = ctx.lexMap.get(ref);
    if (!lex) return null;
    if (kind === 'rec') {
      return { id: cardId, kind, answerLang: 'en', cue: lex.display, cueIsL2: true, cueSub: POS_LABEL[lex.pos], accepted: lex.acceptEn, sayText: lex.display, lex };
    }
    return {
      id: cardId,
      kind,
      answerLang: 'l2',
      cue: lex.translations.join(', '),
      cueIsL2: false,
      cueSub: POS_LABEL[lex.pos] + (lex.gender ? `, ${lex.gender === 'm' ? 'masculine' : 'feminine'}` : ''),
      cueHint: lex.prodHint,
      accepted: lex.acceptL2,
      sayText: lex.display,
      lex,
    };
  }
  if (kind === 'drill') {
    const drill = ctx.drills.get(ref);
    if (!drill) return null;
    return {
      id: cardId,
      kind,
      answerLang: 'l2',
      cue: drill.drill.prompt,
      cueIsL2: true,
      cueSub: drill.drill.en,
      accepted: drill.drill.answer,
      options: drill.drill.type === 'choose' ? drill.drill.options : undefined,
      sayText: drillSentence(drill),
      drill,
    };
  }
  const custom = ctx.progress.customCards[ref];
  if (!custom) return null;
  const rec = custom.direction === 'rec';
  return {
    id: cardId,
    kind,
    answerLang: rec ? 'en' : 'l2',
    cue: custom.front,
    cueIsL2: rec,
    accepted: rec ? custom.back.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [custom.back],
    sayText: rec ? custom.front : custom.back,
    custom,
  };
}

/** Card back: word, gender/article, example with translation, audio and a say-it-aloud prompt. */
export function CardBack({ model, pack }: { model: CardModel; pack: LanguagePack }) {
  const { lex, drill, custom } = model;
  if (lex) {
    const v = lex.verb;
    return (
      <div className="card-back">
        <div className="back-word">
          <span lang={pack.meta.ttsLang}>{lex.display}</span>
          <SpeakButton text={lex.display} />
        </div>
        <p className="back-meta">
          {POS_LABEL[lex.pos]}
          {lex.gender ? ` · ${lex.gender === 'm' ? 'masculine' : 'feminine'}` : ''}
          {lex.plural && lex.plural !== lex.lemma ? ` · plural: ${lex.plural}` : ''}
        </p>
        <p className="back-translation">{lex.translations.join(', ')}</p>
        {lex.note ? <p className="muted small">{lex.note}</p> : null}
        {v ? (
          <table className="conj-table">
            <caption className="sr-only">Present tense of {v.infinitive}</caption>
            <tbody>
              {pack.meta.persons.map((person, i) => (
                <tr key={person}>
                  <th scope="row">{pack.meta.personLabels[i]}</th>
                  <td lang={pack.meta.ttsLang}>{v.present[person]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="example">
          <p lang={pack.meta.ttsLang}>
            {lex.example.l2} <SpeakButton text={lex.example.l2} />
          </p>
          <p className="muted">{lex.example.en}</p>
        </div>
        <SayAloud target={lex.display} />
      </div>
    );
  }
  if (drill) {
    const sentence = drillSentence(drill);
    return (
      <div className="card-back">
        {sentence ? (
          <div className="back-word">
            <span lang={pack.meta.ttsLang}>{sentence}</span>
            <SpeakButton text={sentence} />
          </div>
        ) : null}
        <p>{drill.drill.explanation}</p>
        <p className="muted small">
          From: <Link to={`/grammar/${drill.lesson.id}`}>{drill.lesson.title}</Link>
        </p>
        {sentence ? <SayAloud target={sentence} /> : null}
      </div>
    );
  }
  if (custom) {
    const l2 = custom.direction === 'rec' ? custom.front : custom.back;
    return (
      <div className="card-back">
        <div className="back-word">
          <span lang={pack.meta.ttsLang}>{l2}</span>
          <SpeakButton text={l2} />
        </div>
        <p className="back-translation">{custom.direction === 'rec' ? custom.back : custom.front}</p>
        {custom.note ? <p className="muted small">{custom.note}</p> : null}
        <SayAloud target={l2} />
      </div>
    );
  }
  return null;
}

/** Production effect: saying a word aloud improves memory for it. */
function SayAloud({ target }: { target: string }) {
  return (
    <div className="say-aloud">
      <span>Say it aloud.</span>
      <RecordButton target={target} label="Check pronunciation" />
    </div>
  );
}

const MATCH_COPY: Record<GradeResult['kind'], string> = {
  exact: 'Correct',
  accent: 'Right word, but check the accents',
  typo: 'One letter off',
  wrong: 'Not quite',
};

/**
 * One typed-recall card: type the answer (Enter), see feedback and the card back, then accept
 * the suggested grade (Enter) or override with 1-4.
 */
export function StudyCard({
  model,
  pack,
  progress,
  now,
  onGraded,
}: {
  model: CardModel;
  pack: LanguagePack;
  progress: Progress;
  now: number;
  onGraded: (grade: Grade, elapsedMs: number) => void;
}) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const startedAt = useRef(Date.now());
  const gradedRef = useRef(false);
  const revealedAt = useRef(0);

  const submit = (value: string) => {
    if (result) return;
    revealedAt.current = performance.now();
    setInput(value);
    setResult(
      model.answerLang === 'en'
        ? autoGrade(value, model.accepted, { english: true })
        : autoGrade(value, model.accepted, { allowTypo: model.kind !== 'drill' }),
    );
  };

  const grade = (g: Grade) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    onGraded(g, Date.now() - startedAt.current);
  };

  // Keyboard: Enter accepts the suggested grade, 1-4 override. The listener is attached as soon
  // as the answer is revealed; Enter is ignored for a moment so the keypress that submitted the
  // answer (or an accidental double press) doesn't also grade it.
  const suggested = result?.grade;
  useEffect(() => {
    if (suggested == null) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key >= '1' && e.key <= '4' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        grade(Number(e.key) as Grade);
      } else if (e.key === 'Enter' && !e.repeat && performance.now() - revealedAt.current > 250) {
        // A focused grade button handles Enter itself (native click).
        if (target && target.tagName === 'BUTTON') return;
        e.preventDefault();
        grade(suggested);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // grade is stable for the lifetime of this card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  const record = progress.cards[model.id] ?? newCardRecord(model.id, now);
  const previews = result ? previewIntervals(record, now, fsrsParams(progress.settings)) : null;
  const typeLabel = model.answerLang === 'en' ? 'Type the English meaning' : `Type it in ${pack.meta.name}`;

  return (
    <article className="study-card">
      <div className="cue">
        <p className="cue-type">
          {model.kind === 'drill' ? 'Grammar' : model.answerLang === 'en' ? `${pack.meta.name} → English` : `English → ${pack.meta.name}`}
          {model.cueSub ? ` · ${model.cueSub}` : ''}
        </p>
        <p className="cue-text" lang={model.cueIsL2 ? pack.meta.ttsLang : 'en'}>
          {model.cue}
          {model.cueIsL2 && model.kind !== 'drill' ? <SpeakButton text={model.cue} /> : null}
        </p>
        {model.cueHint ? <p className="muted small">({model.cueHint})</p> : null}
      </div>

      {!result ? (
        <>
          {model.options ? (
            <div className="options" role="group" aria-label="Choose an answer">
              {model.options.map((o) => (
                <button key={o} type="button" className="btn btn-option" onClick={() => submit(o)} lang={pack.meta.ttsLang}>
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <AnswerInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              lang={model.answerLang === 'en' ? 'en' : pack.meta.ttsLang}
              label={typeLabel}
              placeholder={typeLabel}
              accentKeys={model.answerLang === 'l2' ? pack.meta.accentKeys : undefined}
            />
          )}
          <button type="button" className="btn btn-link" onClick={() => submit('')}>
            Show answer
          </button>
        </>
      ) : (
        <>
          <div className={`feedback feedback-${result.kind}`} role="status" aria-live="polite">
            <p className="feedback-title">{MATCH_COPY[result.kind]}</p>
            {input.trim() && result.kind !== 'exact' ? (
              <p className="small">
                You wrote: <span className="w-diff">{input}</span>
              </p>
            ) : null}
            <p className="feedback-answer">
              Answer: <strong lang={model.answerLang === 'l2' ? pack.meta.ttsLang : 'en'}>{result.expected}</strong>
            </p>
            {model.accepted.length > 1 ? <p className="muted small">Also accepted: {model.accepted.filter((a) => a !== result.expected).join(', ')}</p> : null}
          </div>

          <CardBack model={model} pack={pack} />

          <div className="grade-bar" role="group" aria-label="How well did you know it? Keys 1 to 4">
            {([1, 2, 3, 4] as Grade[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`grade-btn grade-${g} ${g === result.grade ? 'is-suggested' : ''}`}
                onClick={() => grade(g)}
                autoFocus={g === result.grade}
              >
                <span className="grade-name">
                  <kbd>{g}</kbd> {GRADE_LABELS[g]}
                </span>
                {previews ? <span className="grade-ivl">{formatInterval(previews[g])}</span> : null}
              </button>
            ))}
          </div>
          <p className="muted small center">Enter accepts the highlighted grade. Keys 1–4 choose another.</p>
        </>
      )}
    </article>
  );
}
