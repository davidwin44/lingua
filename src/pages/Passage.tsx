import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useSpeak, useStopSpeechOnUnmount, stopSpeaking, ttsSupported } from '../state/hooks';
import { passageCoverage } from '../lib/coverage';
import { completePassage, knownLemmas } from '../lib/progress';
import { wordGroups } from '../lib/text';
import { srSupported } from '../lib/speech';
import { WordPopover } from '../components/WordPopover';
import { RecordButton } from '../components/RecordButton';
import { Icon } from '../components/Icon';

export function Passage() {
  const { passageId } = useParams();
  const { pack, lexicon, progress, update } = useApp();
  const passage = pack.passages.find((p) => p.id === passageId);
  const say = useSpeak();
  useStopSpeechOnUnmount();

  const [popover, setPopover] = useState<{ surface: string; key: string } | null>(null);
  const [showAllEn, setShowAllEn] = useState(false);
  const [openEn, setOpenEn] = useState<number[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [shadowing, setShadowing] = useState(false);
  const [shadowIndex, setShadowIndex] = useState(0);
  const [shadowState, setShadowState] = useState<'ready' | 'playing' | 'your-turn'>('ready');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const playToken = useRef(0);

  const closePopover = useCallback(() => setPopover(null), []);

  const stop = () => {
    playToken.current++;
    stopSpeaking();
    setPlaying(null);
  };

  if (!passage) {
    return (
      <div className="page">
        <p>That passage doesn’t exist.</p>
        <Link to="/library">Back to the library</Link>
      </div>
    );
  }

  const coverage = passageCoverage(passage, knownLemmas(progress, lexicon));
  const rate = progress.settings.ttsRate;
  const tts = ttsSupported();

  const playFrom = (i: number, continuous: boolean) => {
    const token = ++playToken.current;
    setPlaying(i);
    say(passage.sentences[i].l2, {
      onEnd: () => {
        if (token !== playToken.current) return;
        if (continuous && i + 1 < passage.sentences.length) playFrom(i + 1, true);
        else setPlaying(null);
      },
    });
  };

  const playShadow = () => {
    setShadowState('playing');
    const token = ++playToken.current;
    say(passage.sentences[shadowIndex].l2, {
      onEnd: () => {
        if (token === playToken.current) setShadowState('your-turn');
      },
    });
  };

  const answered = Object.keys(answers).length;
  const score = passage.questions.filter((q, i) => answers[i] === q.answerIndex).length;
  const answer = (qi: number, oi: number) => {
    if (answers[qi] !== undefined) return;
    const next = { ...answers, [qi]: oi };
    setAnswers(next);
    if (Object.keys(next).length === passage.questions.length) {
      const s = passage.questions.filter((q, i) => next[i] === q.answerIndex).length;
      update((p, now) => completePassage(p, passage.id, s, passage.questions.length, now));
    }
  };

  return (
    <div className="page passage">
      <Link to="/library" className="back-link">
        <Icon name="back" size={16} /> Reading
      </Link>
      <div className="passage-head">
        <div>
          <p className="eyebrow">{passage.level}</p>
          <h1 lang={pack.meta.ttsLang}>{passage.title}</h1>
        </div>
        <div className="row-meta">
          <span className={`tag tag-${coverage.badge.toLowerCase()}`}>{coverage.badge}</span>
          <span>{Math.round(coverage.ratio * 100)}% of words known</span>
        </div>
      </div>

      <section className="audio-bar" aria-label="Audio controls">
        {tts ? (
          <>
            <div className="row-wrap">
              {playing === null ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => playFrom(0, true)} disabled={shadowing}>
                  <Icon name="play" size={14} /> Play all
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={stop}>
                  <Icon name="stop" size={14} /> Stop
                </button>
              )}
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={shadowing}
                  onChange={(e) => {
                    stop();
                    setShadowing(e.target.checked);
                    setShadowIndex(0);
                    setShadowState('ready');
                  }}
                />
                Shadowing
              </label>
              <label className="toggle">
                <input type="checkbox" checked={showAllEn} onChange={(e) => setShowAllEn(e.target.checked)} />
                Translations
              </label>
            </div>
            <label className="rate">
              <span>Speed {rate.toFixed(2)}×</span>
              <input
                type="range"
                min={0.6}
                max={1.1}
                step={0.05}
                value={rate}
                onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, ttsRate: Number(e.target.value) } }))}
                aria-label="Speech speed"
              />
            </label>
          </>
        ) : (
          <>
            <p className="muted small">Audio isn’t available in this browser.</p>
            <label className="toggle">
              <input type="checkbox" checked={showAllEn} onChange={(e) => setShowAllEn(e.target.checked)} />
              Show translations
            </label>
          </>
        )}
      </section>

      {shadowing ? (
        <section className="panel shadow-panel" aria-live="polite">
          <p className="eyebrow">
            Shadowing, sentence {shadowIndex + 1} of {passage.sentences.length}
          </p>
          <p className="shadow-sentence" lang={pack.meta.ttsLang}>
            {passage.sentences[shadowIndex].l2}
          </p>
          {shadowState === 'your-turn' ? (
            <>
              <p>Now say it aloud, copying the rhythm.</p>
              <RecordButton key={shadowIndex} target={passage.sentences[shadowIndex].l2} label="Record (optional)" />
              {!srSupported() ? <p className="muted small">Speech checking isn’t available in this browser.</p> : null}
            </>
          ) : null}
          <div className="row-wrap">
            <button type="button" className="btn btn-primary btn-sm" onClick={playShadow} disabled={shadowState === 'playing'}>
              <Icon name="play" size={14} /> {shadowState === 'ready' ? 'Play sentence' : 'Play again'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={shadowIndex + 1 >= passage.sentences.length}
              onClick={() => {
                stop();
                setShadowIndex(shadowIndex + 1);
                setShadowState('ready');
              }}
            >
              Next sentence
            </button>
          </div>
        </section>
      ) : null}

      <section className="reader" aria-label="Text">
        {passage.sentences.map((s, i) => {
          const showEn = showAllEn || openEn.includes(i);
          return (
            <div key={i} className={`sentence ${playing === i || (shadowing && shadowIndex === i) ? 'is-playing' : ''}`}>
              <p className="sentence-l2" lang={pack.meta.ttsLang}>
                {wordGroups(s.l2).map((group, gi) =>
                  group.space ? (
                    group.text
                  ) : (
                    <span key={gi} className="tok-group">
                      {group.pieces.map((piece, pi) =>
                        piece.key ? (
                          <button key={pi} type="button" className="tok" onClick={() => setPopover({ surface: piece.text, key: piece.key! })}>
                            {piece.text}
                          </button>
                        ) : (
                          <span key={pi}>{piece.text}</span>
                        ),
                      )}
                    </span>
                  ),
                )}
              </p>
              <div className="sentence-tools">
                {tts ? (
                  <button type="button" className="btn btn-link btn-sm" onClick={() => playFrom(i, false)} aria-label={`Play sentence ${i + 1}`}>
                    Play
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-link btn-sm"
                  onClick={() => setOpenEn((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))}
                  aria-expanded={showEn}
                >
                  {showEn ? 'Hide' : 'Translate'}
                </button>
                <RecordButton target={s.l2} label="Say it" compact />
              </div>
              {showEn ? <p className="sentence-en muted">{s.en}</p> : null}
            </div>
          );
        })}
      </section>

      <section className="section" aria-labelledby="q-title">
        <h2 id="q-title">Questions</h2>
        <ol className="questions">
          {passage.questions.map((q, qi) => {
            const picked = answers[qi];
            return (
              <li key={qi}>
                <p className="question">{q.q}</p>
                <div className="options" role="group" aria-label={q.q}>
                  {q.options.map((o, oi) => {
                    const state = picked === undefined ? '' : oi === q.answerIndex ? 'is-right' : picked === oi ? 'is-wrong' : '';
                    return (
                      <button key={oi} type="button" className={`btn btn-option ${state}`} onClick={() => answer(qi, oi)} disabled={picked !== undefined}>
                        {o}
                      </button>
                    );
                  })}
                </div>
                {picked !== undefined ? (
                  <p className={`small ${picked === q.answerIndex ? 'text-ok' : 'text-bad'}`} role="status">
                    {picked === q.answerIndex ? 'Right. ' : 'Not quite. '}
                    {q.explanation}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        {answered === passage.questions.length ? (
          <p className="note">
            {score} of {passage.questions.length} right. Marked as read.
          </p>
        ) : null}
      </section>

      {popover ? <WordPopover surface={popover.surface} gloss={passage.gloss[popover.key]} onClose={closePopover} /> : null}
    </div>
  );
}
