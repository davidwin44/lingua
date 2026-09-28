import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';

export function Grammar() {
  const { pack, progress } = useApp();
  const lessons = pack.grammar;

  return (
    <div className="page">
      <h1>Grammar</h1>
      <p className="lede">A short explanation and examples, then practice. When you miss, you get a hint before the answer.</p>

      <section className="section" aria-labelledby="lessons-title">
        <h2 id="lessons-title">Lessons</h2>
        <ol className="index-list">
          {lessons.map((l, i) => {
            const done = progress.lessonsCompleted[l.id];
            const prev = i > 0 ? lessons[i - 1] : null;
            const recommendAfter = prev && !progress.lessonsCompleted[prev.id] ? prev : null;
            return (
              <li key={l.id}>
                <Link to={`/grammar/${l.id}`} className="row-link">
                  <span className="row-num">{l.order}</span>
                  <div className="row-main">
                    <p className="row-title">{l.title}</p>
                    <p className="muted small">
                      {l.level}
                      {!done && recommendAfter ? ` · recommended after lesson ${recommendAfter.order}` : ''}
                    </p>
                  </div>
                  <span className={`row-meta ${done ? 'row-done' : ''}`}>{done ? `${done.score}/${done.total}` : ''}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section" aria-labelledby="mixed-title">
        <h2 id="mixed-title">Mixed practice</h2>
        <p className="muted">Forms that are easy to confuse, shuffled so you have to decide each time. Do the lesson first.</p>
        <ul className="index-list">
          {pack.interleave.map((s) => {
            const ready = s.introducedIn.every((id) => progress.lessonsCompleted[id]);
            return (
              <li key={s.id}>
                <Link to={`/grammar/mixed/${s.id}`} className="row-link">
                  <div className="row-main">
                    <p className="row-title">{s.title}</p>
                    {!ready ? (
                      <p className="muted small">
                        Recommended after: {s.introducedIn.map((id) => pack.grammar.find((g) => g.id === id)?.title ?? id).join(' and ')}
                      </p>
                    ) : (
                      <p className="muted small">{s.itemIds.length} items</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
