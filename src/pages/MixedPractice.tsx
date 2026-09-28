import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { PromptedDrill, type DrillResult } from '../components/PromptedDrill';
import { drillSentence } from '../components/Card';
import { Icon } from '../components/Icon';
import { interleaveByCategory } from '../lib/interleave';
import { recordDrillResult } from '../lib/progress';

/**
 * Interleaved practice for CONFUSABLE grammar categories only (Principle 7). Items from the set
 * are ordered so consecutive items come from different categories, forcing the learner to
 * decide which rule applies each time. Interleaving is deliberately NOT used for vocabulary.
 */
export function MixedPractice() {
  const { setId } = useParams();
  const { pack, drills, progress, update } = useApp();
  const set = pack.interleave.find((s) => s.id === setId);
  const [items] = useState(() => {
    if (!set) return [];
    const refs = set.itemIds.map((id) => drills.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
    return interleaveByCategory(refs, (r) => r.drill.category ?? '');
  });
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ category: string; r: DrillResult }[]>([]);

  if (!set) {
    return (
      <div className="page">
        <p>That practice set doesn’t exist.</p>
        <Link to="/grammar">Back to grammar</Link>
      </div>
    );
  }

  const current = items[index];
  const finished = index >= items.length;

  const onComplete = (r: DrillResult) => {
    const category = current.drill.category ?? '';
    setResults((all) => [...all, { category, r }]);
    update((p, now) => recordDrillResult(p, current.drill.id, r.grade, now));
    setIndex(index + 1);
  };

  return (
    <div className="page">
      <Link to="/grammar" className="back-link">
        <Icon name="back" size={16} /> Grammar
      </Link>
      <p className="eyebrow">Mixed practice</p>
      <h1>{set.title}</h1>

      {!started ? (
        <section className="section">
          <p className="lede">{set.description}</p>
          <p className="muted small">Shuffled so that each item needs a different rule from the one before ({set.categories.join(', ')}).</p>
          <h2 className="h3">Covered in</h2>
          <ul className="plain-list">
            {set.introducedIn.map((id) => {
              const lesson = pack.grammar.find((g) => g.id === id);
              const done = Boolean(progress.lessonsCompleted[id]);
              return (
                <li key={id}>
                  <Link to={`/grammar/${id}`}>{lesson?.title ?? id}</Link>
                  <span className={done ? 'tag tag-ok' : 'muted small'}>{done ? 'done' : 'recommended first'}</span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>
            Start ({items.length} items)
          </button>
        </section>
      ) : null}

      {started && !finished && current ? (
        <section className="panel">
          <p className="progress-line">
            {index + 1} / {items.length}
          </p>
          <PromptedDrill
            key={current.drill.id}
            prompt={current.drill.prompt}
            subPrompt={current.drill.en}
            accepted={current.drill.answer}
            hints={current.drill.hints}
            explanation={current.drill.explanation}
            options={current.drill.type === 'choose' ? current.drill.options : undefined}
            justify={current.drill.justify}
            lang={pack.meta.ttsLang}
            accentKeys={pack.meta.accentKeys}
            sayText={drillSentence(current)}
            continueLabel={index + 1 < items.length ? 'Next item' : 'See results'}
            onComplete={onComplete}
          />
        </section>
      ) : null}

      {started && finished ? (
        <section className="section">
          <h2>Results</h2>
          <ul className="plain-list">
            {set.categories.map((c) => {
              const rs = results.filter((x) => x.category === c);
              if (rs.length === 0) return null;
              const first = rs.filter((x) => x.r.solved && x.r.wrongAttempts === 0).length;
              return (
                <li key={c}>
                  <strong>{c}</strong>: {first}/{rs.length} right first time
                </li>
              );
            })}
          </ul>
          <p className="muted">New items are now in your review deck.</p>
          <div className="row-wrap">
            <Link to="/grammar" className="btn btn-primary">
              Back to grammar
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
