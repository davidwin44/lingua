import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { MiniMarkdown } from '../components/MiniMarkdown';
import { PromptedDrill, type DrillResult } from '../components/PromptedDrill';
import { SpeakButton } from '../components/SpeakButton';
import { RecordButton } from '../components/RecordButton';
import { drillSentence } from '../components/Card';
import { Icon } from '../components/Icon';
import { completeLesson, recordDrillResult } from '../lib/progress';

/** Explicit grammar mini-lesson (Principle 6): short rule, worked examples, then prompt-first drills. */
export function GrammarLesson() {
  const { lessonId } = useParams();
  const { pack, drills, progress, update } = useApp();
  const lesson = pack.grammar.find((l) => l.id === lessonId);
  const [phase, setPhase] = useState<'learn' | 'drill' | 'done'>('learn');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<DrillResult[]>([]);

  if (!lesson) {
    return (
      <div className="page">
        <p>That lesson doesn’t exist.</p>
        <Link to="/grammar">Back to grammar</Link>
      </div>
    );
  }

  const i = pack.grammar.indexOf(lesson);
  const prev = i > 0 ? pack.grammar[i - 1] : null;
  const next = pack.grammar[i + 1];
  const drill = lesson.drills[index];

  const onComplete = (r: DrillResult) => {
    const all = [...results, r];
    setResults(all);
    update((p, now) => recordDrillResult(p, drill.id, r.grade, now));
    if (index + 1 < lesson.drills.length) setIndex(index + 1);
    else {
      const score = all.filter((x) => x.solved).length;
      update((p, now) => completeLesson(p, lesson.id, score, all.length, now));
      setPhase('done');
    }
  };

  return (
    <div className="page lesson">
      <Link to="/grammar" className="back-link">
        <Icon name="back" size={16} /> Grammar
      </Link>
      <p className="eyebrow">
        Lesson {lesson.order} · {lesson.level}
      </p>
      <h1>{lesson.title}</h1>
      {prev && !progress.lessonsCompleted[prev.id] ? (
        <p className="muted small">
          Recommended after <Link to={`/grammar/${prev.id}`}>{prev.title}</Link>.
        </p>
      ) : null}

      {phase === 'learn' ? (
        <>
          <section className="section">
            <MiniMarkdown text={lesson.explanation} />
            {lesson.table ? (
              <div className="table-wrap">
                <table className="grammar-table">
                  <thead>
                    <tr>
                      {lesson.table.headers.map((h, hi) => (
                        <th key={hi} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lesson.table.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) =>
                          ci === 0 ? (
                            <th key={ci} scope="row">
                              {cell}
                            </th>
                          ) : (
                            <td key={ci} lang={pack.meta.ttsLang}>
                              {cell}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="section">
            <h2>Examples</h2>
            <ul className="examples">
              {lesson.examples.map((ex) => (
                <li key={ex.l2}>
                  <p lang={pack.meta.ttsLang} className="example-l2">
                    {ex.l2} <SpeakButton text={ex.l2} />
                  </p>
                  <p className="muted">{ex.en}</p>
                  <RecordButton target={ex.l2} label="Say it" />
                </li>
              ))}
            </ul>
          </section>

          <div className="section">
            <button type="button" className="btn btn-primary" onClick={() => setPhase('drill')}>
              Practise ({lesson.drills.length} items)
            </button>
          </div>
        </>
      ) : null}

      {phase === 'drill' && drill ? (
        <section className="panel" aria-label={`Item ${index + 1} of ${lesson.drills.length}`}>
          <div className="progress-line">
            <span>
              {index + 1} / {lesson.drills.length}
            </span>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${(index / lesson.drills.length) * 100}%` }} />
            </div>
          </div>
          <PromptedDrill
            key={drill.id}
            prompt={drill.prompt}
            subPrompt={drill.en}
            accepted={drill.answer}
            hints={drill.hints}
            explanation={drill.explanation}
            options={drill.type === 'choose' ? drill.options : undefined}
            justify={drill.justify}
            lang={pack.meta.ttsLang}
            accentKeys={pack.meta.accentKeys}
            sayText={drills.get(drill.id) ? drillSentence(drills.get(drill.id)!) : undefined}
            continueLabel={index + 1 < lesson.drills.length ? 'Next item' : 'Finish'}
            onComplete={onComplete}
          />
        </section>
      ) : null}

      {phase === 'done' ? (
        <section className="section">
          <h2>Lesson complete</h2>
          <p>
            {results.filter((r) => r.solved && r.wrongAttempts === 0).length} right first time, {results.filter((r) => r.solved && r.wrongAttempts > 0).length}{' '}
            after a hint, {results.filter((r) => !r.solved).length} shown.
          </p>
          <p className="muted">These items are now in your review deck. The ones you missed come back sooner.</p>
          <div className="row-wrap">
            {next ? (
              <Link to={`/grammar/${next.id}`} className="btn btn-primary">
                Next lesson: {next.title}
              </Link>
            ) : null}
            <Link to="/grammar" className="btn btn-ghost">
              Mixed practice
            </Link>
            <button
              type="button"
              className="btn btn-link"
              onClick={() => {
                setResults([]);
                setIndex(0);
                setPhase('learn');
              }}
            >
              Read the lesson again
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
