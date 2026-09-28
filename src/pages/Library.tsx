import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { passageCoverage } from '../lib/coverage';
import { knownLemmas } from '../lib/progress';

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

  return (
    <div className="page">
      <h1>Reading</h1>
      <p className="lede">Short texts, easiest for you first. Tap any word for its meaning.</p>
      <ul className="index-list">
        {rows.map(({ p, cov }) => {
          const done = progress.passagesCompleted[p.id];
          return (
            <li key={p.id}>
              <Link to={`/library/${p.id}`} className="row-link">
                <div className="row-main">
                  <p className="row-title" lang={pack.meta.ttsLang}>
                    {p.title}
                  </p>
                  <p className="muted small">
                    {p.level} · {p.summary}
                  </p>
                </div>
                <div className="row-meta">
                  <span className={`tag tag-${cov.badge.toLowerCase()}`}>{cov.badge}</span>
                  <div>{Math.round(cov.ratio * 100)}% known</div>
                  {done ? (
                    <div className="row-done">
                      Read, {done.score}/{done.total}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        Comfortable means you know 95% or more of the words, Stretch 90 to 95%, Hard less than that. A word counts as known once it reaches the
        review stage.
      </p>
    </div>
  );
}
