import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useInstallState, useSpeak, useVoices } from '../state/hooks';
import { promptInstall } from '../lib/install';
import { intervalMultiplier } from '../lib/fsrs';
import { DEFAULT_MODEL } from '../lib/claude';
import { createFreshProgress } from '../lib/progress';
import { exportProgress, importProgress } from '../lib/storage';
import { LanguagePicker } from '../components/LanguagePicker';
import { ttsSupported } from '../lib/tts';
import { srSupported } from '../lib/speech';
import type { Goal, GoalReason, Settings as SettingsT } from '../lib/types';
import { GOAL_LABELS } from './Onboarding';

/** Plain-language workload note for a desired retention, relative to the 0.90 default. */
export function workloadNote(r: number): string {
  const mult = intervalMultiplier(r);
  const forget = Math.round((1 - r) * 100);
  if (Math.abs(r - 0.9) < 0.005) return 'The default. You’ll remember about 90% of cards when they come back.';
  const reviews = 1 / mult;
  if (r > 0.9) {
    return `${r.toFixed(2)} means about ${reviews.toFixed(1)}× more reviews than 0.90, to remember ${100 - forget}% of cards.`;
  }
  return `${r.toFixed(2)} means about ${reviews.toFixed(1)}× the reviews of 0.90, but you’ll forget about ${forget}% of cards between reviews.`;
}

export function Settings() {
  const { pack, progress, update, replace } = useApp();
  const navigate = useNavigate();
  const s = progress.settings;
  const voices = useVoices(pack.meta.ttsLang);
  const say = useSpeak();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const install = useInstallState();

  const set = <K extends keyof SettingsT>(key: K, value: SettingsT[K]) => update((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));
  const setGoal = (g: Partial<Goal>) => update((p) => ({ ...p, goal: { ...(p.goal ?? { reason: 'fun', unit: 'minutes', target: 60 }), ...g } }));

  const doExport = () => {
    try {
      const blob = new Blob([exportProgress(progress)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lingua-progress-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Progress exported.');
    } catch {
      setMessage('Export failed in this browser.');
    }
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const p = importProgress(text);
      replace(p);
      setMessage(`Imported progress: ${Object.keys(p.cards).length} cards.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const mult = intervalMultiplier(s.desiredRetention);

  return (
    <div className="page settings">
      <h1>Settings</h1>
      {message ? (
        <p className="note" role="status">
          {message}
        </p>
      ) : null}

      <section className="section" aria-labelledby="set-lang">
        <h2 id="set-lang">Language</h2>
        <p className="muted">Each language keeps its own progress, goal and settings. Switching never deletes anything.</p>
        <LanguagePicker onPick={() => navigate('/')} />
      </section>

      <section className="section" aria-labelledby="set-install">
        <h2 id="set-install">Desktop app</h2>
        {install === 'installed' ? (
          <p className="muted">Lingua is installed and works offline.</p>
        ) : install === 'available' ? (
          <>
            <p className="muted">Install Lingua to open it in its own window from the Start menu or taskbar. It works offline.</p>
            <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
              Install Lingua
            </button>
          </>
        ) : (
          <p className="muted">
            To install it, open Lingua in Edge or Chrome (with <code>npm run app</code>) and use the install icon at the right of the address bar.
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="set-sched">
        <h2 id="set-sched">Review schedule</h2>
        <label className="field">
          <span>
            Target recall: <strong>{s.desiredRetention.toFixed(2)}</strong> (intervals {mult.toFixed(2)}× stability)
          </span>
          <input
            type="range"
            min={0.8}
            max={0.95}
            step={0.01}
            value={s.desiredRetention}
            onChange={(e) => set('desiredRetention', Number(e.target.value))}
            aria-describedby="ret-note"
          />
        </label>
        <p id="ret-note" className="muted small">
          {workloadNote(s.desiredRetention)}
        </p>
        <p className="muted small">0.80 → 3.32× · 0.85 → 1.91× · 0.90 → 1.00× · 0.95 → 0.40×</p>

        <label className="field">
          <span>
            New words per day: <strong>{s.newPerDay}</strong>
          </span>
          <input type="range" min={0} max={30} step={1} value={s.newPerDay} onChange={(e) => set('newPerDay', Number(e.target.value))} />
        </label>
        <p className="muted small">Each new word adds a few reviews a day over the following weeks.</p>

        <label className="field">
          <span>
            Maximum reviews per day: <strong>{s.maxReviewsPerDay}</strong>
          </span>
          <input type="range" min={20} max={500} step={10} value={s.maxReviewsPerDay} onChange={(e) => set('maxReviewsPerDay', Number(e.target.value))} />
        </label>
        <p className="muted small">Anything over the limit moves to the following days.</p>
      </section>

      <section className="section" aria-labelledby="set-goal">
        <h2 id="set-goal">Goal</h2>
        <label className="field">
          <span>Why you’re learning</span>
          <select value={progress.goal?.reason ?? 'fun'} onChange={(e) => setGoal({ reason: e.target.value as GoalReason })}>
            {(Object.keys(GOAL_LABELS) as GoalReason[]).map((r) => (
              <option key={r} value={r}>
                {GOAL_LABELS[r].title}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Weekly target</span>
            <input
              type="number"
              min={1}
              max={2000}
              value={progress.goal?.target ?? 60}
              onChange={(e) => setGoal({ target: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })}
            />
          </label>
          <label className="field">
            <span>Measured in</span>
            <select value={progress.goal?.unit ?? 'minutes'} onChange={(e) => setGoal({ unit: e.target.value as Goal['unit'] })}>
              <option value="minutes">minutes per week</option>
              <option value="sessions">sessions per week</option>
            </select>
          </label>
        </div>
      </section>

      <section className="section" aria-labelledby="set-audio">
        <h2 id="set-audio">Audio</h2>
        {ttsSupported() ? (
          <>
            <label className="field">
              <span>Voice</span>
              <select value={s.voiceURI ?? ''} onChange={(e) => set('voiceURI', e.target.value || null)}>
                <option value="">Automatic ({pack.meta.name} voice if available)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
            {voices.length === 0 ? (
              <p className="muted small">No {pack.meta.name} voice was found on this device; your browser may use a default voice.</p>
            ) : null}
            <label className="field">
              <span>
                Speed: <strong>{s.ttsRate.toFixed(2)}×</strong>
              </span>
              <input type="range" min={0.6} max={1.1} step={0.05} value={s.ttsRate} onChange={(e) => set('ttsRate', Number(e.target.value))} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => say('Ciao! Come stai? Io sto bene, grazie.')}>
              Test voice
            </button>
          </>
        ) : (
          <p className="muted">Text-to-speech isn’t available in this browser.</p>
        )}
        <p className="muted small">
          Pronunciation checking: {srSupported() ? 'available in this browser.' : 'not available in this browser (works in Chrome and Edge).'}
        </p>
      </section>

      <section className="section" aria-labelledby="set-tutor">
        <h2 id="set-tutor">Claude tutor (optional)</h2>
        <p className="small">
          Your API key is stored <strong>only in this browser’s localStorage</strong> and is sent <strong>only to api.anthropic.com</strong> when you
          use the role-play tutor. Anyone with access to this browser profile could read it. Usage is billed to your Anthropic account.
        </p>
        <label className="field">
          <span>Anthropic API key</span>
          <div className="answer-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={s.apiKey}
              onChange={(e) => set('apiKey', e.target.value.trim())}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label className="field">
          <span>Model ID</span>
          <input type="text" value={s.model} onChange={(e) => set('model', e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
        <div className="row-wrap">
          {s.model !== DEFAULT_MODEL ? (
            <button type="button" className="btn btn-link btn-sm" onClick={() => set('model', DEFAULT_MODEL)}>
              Reset model to {DEFAULT_MODEL}
            </button>
          ) : null}
          {s.apiKey ? (
            <button type="button" className="btn btn-link btn-sm" onClick={() => set('apiKey', '')}>
              Remove key
            </button>
          ) : null}
        </div>
      </section>

      <section className="section" aria-labelledby="set-data">
        <h2 id="set-data">Your data</h2>
        <p className="muted small">Progress is saved in this browser only. Export a backup to move it to another device.</p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary btn-sm" onClick={doExport}>
            Export progress (JSON)
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            Import progress
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import progress file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
            }}
          />
        </div>
        <div className="row-wrap">
          {!confirmReset ? (
            <button type="button" className="btn btn-link btn-sm text-bad" onClick={() => setConfirmReset(true)}>
              Reset all progress…
            </button>
          ) : (
            <>
              <span className="small">This clears every card and setting in this browser.</span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  replace(createFreshProgress(Date.now(), progress.lang));
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="set-about">
        <h2 id="set-about">About the method</h2>
        <p className="small">
          Typed recall with feedback, FSRS-6 spacing across days, most-frequent words first, short explicit grammar with hint-first correction,
          reading at your level, and speaking practice with explicit feedback. See the README for the research behind each feature.
        </p>
        {pack.meta.note ? <p className="muted small">{pack.meta.note}</p> : null}
      </section>
    </div>
  );
}
