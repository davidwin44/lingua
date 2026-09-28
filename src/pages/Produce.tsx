import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { PromptedDrill, type DrillResult } from '../components/PromptedDrill';
import { Icon } from '../components/Icon';
import { markProduction } from '../lib/progress';
import type { ProductionItem } from '../content/types';

/** A narrower second prompt: the opening words and the length of the answer. */
export function narrowerHint(item: ProductionItem): string {
  const words = item.accepted[0].split(/\s+/);
  const start = words.slice(0, Math.min(2, words.length - 1)).join(' ');
  return start ? `It starts “${start} …” and has ${words.length} words.` : `It’s ${words.length} word${words.length === 1 ? '' : 's'} long.`;
}

/**
 * Sentence production (offline): English prompt → type the target language. Uses the same
 * prompt-then-reveal sequence as grammar drills, and highlights differing words on reveal.
 */
export function Produce() {
  const { pack, progress, update } = useApp();
  const [lessonFilter, setLessonFilter] = useState('all');
  const [showTarget, setShowTarget] = useState(true);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<DrillResult[]>([]);

  const items = useMemo(() => {
    const list = pack.production.filter((p) => lessonFilter === 'all' || p.lessonId === lessonFilter);
    // Items not yet done come first.
    return [...list].sort((a, b) => Number(Boolean(progress.productionDone[a.id])) - Number(Boolean(progress.productionDone[b.id])));
    // Order is fixed when the filter changes, not after each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.production, lessonFilter]);

  const item = items[index];

  const onComplete = (r: DrillResult) => {
    setResults((all) => [...all, r]);
    update((p, now) => markProduction(p, item.id, now));
    setIndex(index + 1);
  };

  return (
    <div className="page">
      <Link to="/speak" className="back-link">
        <Icon name="back" size={16} /> Speaking and writing
      </Link>
      <h1>Sentence building</h1>
      <div className="filters">
        <label className="field">
          <span className="small">Focus</span>
          <select
            value={lessonFilter}
            onChange={(e) => {
              setLessonFilter(e.target.value);
              setIndex(0);
              setResults([]);
            }}
          >
            <option value="all">All topics</option>
            {pack.grammar.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showTarget} onChange={(e) => setShowTarget(e.target.checked)} />
          Show the structure
        </label>
      </div>

      {item ? (
        <section className="panel">
          <p className="progress-line">
            {index + 1} / {items.length}
            {progress.productionDone[item.id] ? ' · done before' : ''}
          </p>
          <PromptedDrill
            key={item.id}
            prompt={<span lang="en">{item.en}</span>}
            subPrompt={showTarget ? item.targetStructure : undefined}
            accepted={item.accepted}
            hints={[item.hint, narrowerHint(item)]}
            explanation={`Structure: ${item.targetStructure}.`}
            lang={pack.meta.ttsLang}
            accentKeys={pack.meta.accentKeys}
            showDiff
            sayText={item.accepted[0]}
            continueLabel={index + 1 < items.length ? 'Next sentence' : 'Finish'}
            onComplete={onComplete}
          />
        </section>
      ) : (
        <section className="section">
          <h2>Set complete</h2>
          <p>
            {results.filter((r) => r.solved && r.wrongAttempts === 0).length} right first time, {results.filter((r) => r.solved && r.wrongAttempts > 0).length}{' '}
            after a hint, out of {results.length}.
          </p>
          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setIndex(0);
                setResults([]);
              }}
            >
              Go again
            </button>
            <Link to="/tutor" className="btn btn-link">
              Try a role-play
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
