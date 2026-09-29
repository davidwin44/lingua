import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import type { Goal, GoalReason } from '../lib/types';
import { LanguagePicker } from '../components/LanguagePicker';

export const GOAL_LABELS: Record<GoalReason, { title: string; blurb: string }> = {
  travel: { title: 'Travel', blurb: 'Ordering, directions, hotels, small talk' },
  family: { title: 'Family and friends', blurb: 'Talking with people close to you' },
  work: { title: 'Work', blurb: 'Colleagues, clients, a move abroad' },
  study: { title: 'Study', blurb: 'Courses, exams, reading' },
  fun: { title: 'For fun', blurb: 'Films, books, music' },
};

const PRESETS: Record<Goal['unit'], number[]> = {
  minutes: [30, 60, 90, 150],
  sessions: [3, 4, 5, 7],
};

/**
 * Onboarding: the language, then a real-world goal and a WEEKLY target (Principle 10).
 * Learners with a concrete goal progress faster; weekly targets absorb missed days instead
 * of punishing them.
 */
export function Onboarding() {
  const { pack, update } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<GoalReason | null>(null);
  const [unit, setUnit] = useState<Goal['unit']>('minutes');
  const [target, setTarget] = useState(60);

  const finish = () => {
    if (!reason) return;
    update((p) => ({ ...p, goal: { reason, unit, target } }));
    navigate('/', { replace: true });
  };

  return (
    <main className="onboarding">
      <div className="onboarding-inner">
        <header className="onboarding-head">
          <p className="brand-name">Lingua</p>
          <p className="onboarding-step">Step {step + 1} of 4</p>
        </header>

        {step === 0 ? (
          <section aria-labelledby="ob-lang">
            <h1 id="ob-lang">What do you want to learn?</h1>
            <p className="muted">Each language keeps its own progress, so you can switch later without losing any.</p>
            <LanguagePicker />
            <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>
              Next
            </button>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-labelledby="ob-goal">
            <h1 id="ob-goal">Why are you learning {pack.meta.name}?</h1>
            <p className="muted">You can change this later.</p>
            <div className="choice-list" role="radiogroup" aria-label="Your goal">
              {(Object.keys(GOAL_LABELS) as GoalReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  className={`choice ${reason === r ? 'is-selected' : ''}`}
                  onClick={() => setReason(r)}
                >
                  <span className="choice-dot" aria-hidden="true" />
                  <span className="choice-body">
                    <span className="choice-title">{GOAL_LABELS[r].title}</span>
                    <span className="muted small">{GOAL_LABELS[r].blurb}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="row-wrap">
              <button type="button" className="btn btn-primary" disabled={!reason} onClick={() => setStep(2)}>
                Next
              </button>
              <button type="button" className="btn btn-link" onClick={() => setStep(0)}>
                Back
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="ob-week">
            <h1 id="ob-week">How much each week?</h1>
            <p className="muted">Counted per week, so a missed day doesn’t matter.</p>
            <div className="segmented" role="radiogroup" aria-label="Measure by">
              {(['minutes', 'sessions'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  className={unit === u ? 'is-selected' : ''}
                  onClick={() => {
                    setUnit(u);
                    setTarget(PRESETS[u][1]);
                  }}
                >
                  {u === 'minutes' ? 'Minutes' : 'Sessions'}
                </button>
              ))}
            </div>
            <div className="choice-row" role="radiogroup" aria-label="Weekly target">
              {PRESETS[unit].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={target === n} className={`choice-sm ${target === n ? 'is-selected' : ''}`} onClick={() => setTarget(n)}>
                  <strong>{n}</strong>
                  <span className="muted small">{unit === 'minutes' ? 'min' : 'sessions'}</span>
                </button>
              ))}
            </div>
            <div className="row-wrap">
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                Next
              </button>
              <button type="button" className="btn btn-link" onClick={() => setStep(1)}>
                Back
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby="ob-how">
            <h1 id="ob-how">How it works</h1>
            <ol className="how-list">
              <li>You type answers from memory, then see the right one.</li>
              <li>Each word comes back just before you’d forget it. Up to 10 new words a day, most common first.</li>
              <li>Grammar gives you a hint before the answer. Reading and speaking are at your level.</li>
            </ol>
            <div className="row-wrap">
              <button type="button" className="btn btn-primary" onClick={finish}>
                Start learning
              </button>
              <button type="button" className="btn btn-link" onClick={() => setStep(2)}>
                Back
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
