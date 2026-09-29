import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { passageCoverage } from '../lib/coverage';
import { knownLemmas } from '../lib/progress';

const DIFFICULTY: Record<string, string> = { Comfortable: 'row-state-ok', Stretch: 'row-state-warn', Hard: 'row-state-bad' };

/**
 * Graded reading/listening library, sorted by this learner's known-word coverage
 * (Principle 8: aim for ~95%+ known words).
 */
export function Library() {
  const { pack, lexicon, progress } = useApp();
  const known = knownLemmas(progress, lexicon);
  const rows = pack.passages
    .map((p) => ({ p, cov: passageCoverage(p, known) }))
    .sort((a, b) => b.cov.ratio - a.cov.ratio || a.p.level.localeCompare(b.p.level));
  const read = rows.filter(({ p }) => progress.passagesCompleted[p.id]).length;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Reading</h1>
          <p className="muted">Short texts, easiest for you first. Tap any word for its meaning.</p>
        </div>
        <p className="page-head-stat">
          <strong>{read}</strong> of {rows.length} read
        </p>
      </header>

      <section className="widget widget-table" aria-label="Passages">
        <div className="table-head" aria-hidden="true">
          <span>Passage</span>
          <span>Level</span>
          <span>Words known</span>
          <span>Difficulty</span>
          <span>Status</span>
        </div>
        <ul className="table-rows">
          {rows.map(({ p, cov }) => {
            const done = progress.passagesCompleted[p.id];
            const ratio = Math.round(cov.ratio * 100);
            return (
              <li key={p.id}>
                <Link to={`/library/${p.id}`} className="table-row">
                  <span className="table-title">
                    <span className="card-row-main">
                      <span className="card-row-title" lang={pack.meta.ttsLang}>
                        {p.title}
                      </span>
                      <span className="card-row-sub">{p.summary}</span>
                    </span>
                  </span>
                  <span className="table-cell">
                    <span className="table-label">Level </span>
                    {p.level}
                  </span>
                  <span className="table-cell table-known">
                    <span className="table-label">Known </span>
                    <span>{ratio}%</span>
                    <span className="meter" aria-hidden="true">
                      <span style={{ width: `${ratio}%` }} />
                    </span>
                  </span>
                  <span className="table-cell">
                    <span className={`row-state ${DIFFICULTY[cov.badge] ?? ''}`}>{cov.badge}</span>
                  </span>
                  <span className="table-cell">
                    {done ? (
                      <span className="row-state row-state-ok">
                        Read, {done.score}/{done.total}
                      </span>
                    ) : (
                      <span className="muted small">Not read</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="muted small">
        Comfortable means you know 95% or more of the words, Stretch 90 to 95%, Hard less than that. A word counts as known once it reaches the
        review stage.
      </p>
    </div>
  );
}
