import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { Icon } from '../components/Icon';

export function Grammar() {
  const { pack, progress } = useApp();
  const lessons = pack.grammar;
  const done = lessons.filter((l) => progress.lessonsCompleted[l.id]).length;
  const upNext = lessons.find((l) => !progress.lessonsCompleted[l.id]);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Grammar</h1>
          <p className="muted">A short explanation and examples, then practice. When you miss, you get a hint before the answer.</p>
        </div>
        <p className="page-head-stat">
          <strong>{done}</strong> of {lessons.length} lessons
        </p>
      </header>

      <section className="widget" aria-labelledby="lessons-title">
        <div className="widget-head">
          <h2 id="lessons-title">Lessons</h2>
        </div>
        <ol className="card-list card-list-flush">
          {lessons.map((l, i) => {
            const result = progress.lessonsCompleted[l.id];
            const prev = i > 0 ? lessons[i - 1] : null;
            const recommendAfter = prev && !progress.lessonsCompleted[prev.id] ? prev : null;
            const isNext = upNext?.id === l.id;
            return (
              <li key={l.id}>
                <Link to={`/grammar/${l.id}`} className="card-row">
                  <span className={`num-tile ${result ? 'num-tile-done' : isNext ? 'num-tile-next' : ''}`} aria-hidden="true">
                    {result ? <Icon name="check" size={16} /> : l.order}
                  </span>
                  <span className="card-row-main">
                    <span className="card-row-title">{l.title}</span>
                    <span className="card-row-sub">
                      {l.level}
                      {!result && recommendAfter ? ` · recommended after lesson ${recommendAfter.order}` : ''}
                    </span>
                  </span>
                  {result ? (
                    <span className="badge badge-ok">
                      {result.score}/{result.total}
                    </span>
                  ) : isNext ? (
                    <span className="badge badge-warm">Up next</span>
                  ) : null}
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="widget" aria-labelledby="mixed-title">
        <div className="widget-head">
          <h2 id="mixed-title">Mixed practice</h2>
          <p className="muted small">Forms that are easy to confuse, shuffled so you have to decide each time. Do the lesson first.</p>
        </div>
        <ul className="card-list card-list-flush">
          {pack.interleave.map((s) => {
            const ready = s.introducedIn.every((id) => progress.lessonsCompleted[id]);
            return (
              <li key={s.id}>
                <Link to={`/grammar/mixed/${s.id}`} className="card-row">
                  <span className="icon-tile" aria-hidden="true">
                    <Icon name="layers" size={18} />
                  </span>
                  <span className="card-row-main">
                    <span className="card-row-title">{s.title}</span>
                    {!ready ? (
                      <span className="card-row-sub">
                        Recommended after: {s.introducedIn.map((id) => pack.grammar.find((g) => g.id === id)?.title ?? id).join(' and ')}
                      </span>
                    ) : (
                      <span className="card-row-sub">{s.itemIds.length} items</span>
                    )}
                  </span>
                  {ready ? <span className="badge badge-ok">Ready</span> : null}
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
