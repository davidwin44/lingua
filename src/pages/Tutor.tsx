import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import type { Scenario } from '../content/types';
import { buildSystemPrompt, callTutor, TutorApiError, type ChatMessage, type TutorCorrection } from '../lib/claude';
import { normalize, stripAccents } from '../lib/grading';
import { addCustomCard, markScenario, recordActivity } from '../lib/progress';
import { AnswerInput } from '../components/AnswerInput';
import { SpeakButton } from '../components/SpeakButton';
import { Icon } from '../components/Icon';

type Msg =
  | { id: number; role: 'assistant'; reply: string; replyEn: string; raw: string }
  | { id: number; role: 'user'; text: string; corrections: TutorCorrection[]; failed?: boolean };

/** Learner turns after which a scenario counts as practised. */
const TURNS_TO_COMPLETE = 3;

/**
 * Structured role-play with Claude (optional). Not open chat: each scenario has a goal and a
 * register (informal or formal, e.g. tu / Lei), and corrections are shown as a prompt first so the learner self-corrects.
 */
export function Tutor() {
  const { pack, progress } = useApp();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const hasKey = Boolean(progress.settings.apiKey.trim());

  if (scenario) return <Conversation key={scenario.id} scenario={scenario} onExit={() => setScenario(null)} />;

  return (
    <div className="page">
      <Link to="/speak" className="back-link">
        <Icon name="back" size={16} /> Speaking and writing
      </Link>
      <h1>Role-play</h1>
      {!hasKey ? (
        <p className="note">
          This uses your own Anthropic API key, which you can add in <Link to="/settings">Settings</Link>. Without one,{' '}
          <Link to="/produce">sentence building</Link> gives the same kind of feedback offline.
        </p>
      ) : (
        <p className="lede">Your partner keeps to your level and points out up to two mistakes per turn, with a hint first.</p>
      )}
      <ul className="index-list">
        {pack.scenarios.map((s) => (
          <li key={s.id} className="scenario-row">
            <div className="row-main">
              <p className="row-title">{s.title}</p>
              <p className="small">{s.goal}</p>
              <p className="muted small">
                {s.level} · <span className={`register-${s.register}`}>{`${s.register} (${pack.meta.registers[s.register].label})`}</span>
                {progress.scenariosDone[s.id] ? ' · practised' : ''}
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setScenario(s)} disabled={!hasKey}>
              Start
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Conversation({ scenario, onExit }: { scenario: Scenario; onExit: () => void }) {
  const { pack, progress, update } = useApp();
  const [messages, setMessages] = useState<Msg[]>([
    { id: 0, role: 'assistant', reply: scenario.opening, replyEn: scenario.openingEn, raw: JSON.stringify({ reply: scenario.opening, reply_en: scenario.openingEn, errors: [] }) },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showEn, setShowEn] = useState<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const toApi = (msgs: Msg[]): ChatMessage[] => [
    { role: 'user', content: '(Start the role-play.)' },
    ...msgs.filter((m) => !(m.role === 'user' && m.failed)).map<ChatMessage>((m) => (m.role === 'assistant' ? { role: 'assistant', content: m.raw } : { role: 'user', content: m.text })),
  ];

  const send = async (text: string, history: Msg[]) => {
    const userMsg: Msg = { id: nextId.current++, role: 'user', text, corrections: [] };
    const withUser = [...history, userMsg];
    setMessages(withUser);
    setInput('');
    setBusy(true);
    setError('');
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const started = Date.now();
    try {
      const turn = await callTutor({
        apiKey: progress.settings.apiKey,
        model: progress.settings.model,
        system: buildSystemPrompt(scenario, pack.meta),
        messages: toApi(withUser),
        signal: controller.signal,
      });
      const raw = JSON.stringify({ reply: turn.reply, reply_en: turn.reply_en, errors: turn.errors });
      const next: Msg[] = [
        ...withUser.map((m) => (m.id === userMsg.id ? { ...userMsg, corrections: turn.errors } : m)),
        { id: nextId.current++, role: 'assistant', reply: turn.reply, replyEn: turn.reply_en, raw },
      ];
      setMessages(next);
      const learnerTurns = next.filter((m) => m.role === 'user' && !m.failed).length;
      update((p, now) => {
        const withTime = recordActivity(p, now, now - started + 30_000);
        return learnerTurns >= TURNS_TO_COMPLETE ? markScenario(withTime, scenario.id, now) : withTime;
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setMessages(withUser.map((m) => (m.id === userMsg.id ? { ...userMsg, failed: true } : m)));
      setError(e instanceof TutorApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    const failed = [...messages].reverse().find((m) => m.role === 'user' && m.failed);
    if (!failed || failed.role !== 'user') return;
    send(
      failed.text,
      messages.filter((m) => m.id !== failed.id),
    );
  };

  return (
    <div className="page tutor">
      <button type="button" className="back-link btn-link" onClick={onExit}>
        <Icon name="back" size={16} /> Scenarios
      </button>
      <header>
        <h1>{scenario.title}</h1>
        <p className="lede">{scenario.goal}</p>
        <p className="muted small">
          {scenario.level} · use {pack.meta.registers[scenario.register].label} ({scenario.register})
          {scenario.focus ? ` · ${scenario.focus}` : ''}
        </p>
      </header>

      <div className="chat" aria-live="polite">
        {messages.map((m) =>
          m.role === 'assistant' ? (
            <div key={m.id} className="msg msg-tutor">
              <p lang={pack.meta.ttsLang}>{m.reply}</p>
              <div className="msg-tools">
                <SpeakButton text={m.reply} />
                {m.replyEn ? (
                  <button
                    type="button"
                    className="btn btn-link btn-sm"
                    onClick={() => setShowEn((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                  >
                    {showEn.includes(m.id) ? 'Hide English' : 'English'}
                  </button>
                ) : null}
              </div>
              {showEn.includes(m.id) ? <p className="muted small">{m.replyEn}</p> : null}
            </div>
          ) : (
            <div key={m.id} className="msg-group">
              <div className={`msg msg-me ${m.failed ? 'is-failed' : ''}`}>
                <p lang={pack.meta.ttsLang}>{m.text}</p>
              </div>
              {m.corrections.map((c, i) => (
                <CorrectionCard key={i} correction={c} />
              ))}
            </div>
          ),
        )}
        {busy ? <p className="muted small typing">…</p> : null}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="note note-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="chat-input">
        <AnswerInput
          value={input}
          onChange={setInput}
          onSubmit={(v) => v.trim() && !busy && send(v.trim(), messages)}
          lang={pack.meta.ttsLang}
          label={`Your reply in ${pack.meta.name}`}
          placeholder={`Reply in ${pack.meta.name}…`}
          accentKeys={pack.meta.accentKeys}
          submitLabel={busy ? '…' : 'Send'}
        />
      </div>
    </div>
  );
}

/** Prompt first → learner self-corrects → then reveal the correction and explanation. */
function CorrectionCard({ correction }: { correction: TutorCorrection }) {
  const { pack, progress, update } = useApp();
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tried, setTried] = useState('');

  const matched = tried && stripAccents(normalize(tried)) === stripAccents(normalize(correction.correction));
  const alreadySaved = Object.values(progress.customCards).some((c) => c.back === correction.correction && c.source === 'tutor');

  return (
    <div className={`correction type-${correction.type}`}>
      <p className="correction-head">
        <span>{correction.type}</span>{' '}
        {correction.span ? (
          <span>
            “<span lang={pack.meta.ttsLang}>{correction.span}</span>”
          </span>
        ) : null}
      </p>
      <p className="correction-prompt">{correction.prompt}</p>
      {!revealed ? (
        <>
          <AnswerInput
            value={attempt}
            onChange={setAttempt}
            onSubmit={(v) => {
              setTried(v);
              setRevealed(true);
            }}
            lang={pack.meta.ttsLang}
            label="Your correction"
            placeholder="Fix it yourself…"
            submitLabel="Check"
            autoFocus={false}
          />
          <button type="button" className="btn btn-link btn-sm" onClick={() => setRevealed(true)}>
            Show the correction
          </button>
        </>
      ) : (
        <div className="correction-reveal">
          {tried ? <p className={`small ${matched ? 'text-ok' : 'text-bad'}`}>{matched ? 'You fixed it.' : `You tried “${tried}”.`}</p> : null}
          <p>
            <strong lang={pack.meta.ttsLang}>{correction.correction}</strong> <SpeakButton text={correction.correction} />
          </p>
          <p className="small">{correction.explanation}</p>
          {saved || alreadySaved ? (
            <span className="tag tag-ok">In your deck</span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                update(
                  (p, now) =>
                    addCustomCard(
                      p,
                      {
                        front: `Fix: “${correction.span}” (${correction.prompt})`,
                        back: correction.correction,
                        direction: 'prod',
                        note: correction.explanation,
                        source: 'tutor',
                      },
                      now,
                    ).progress,
                );
                setSaved(true);
              }}
            >
              Save to deck
            </button>
          )}
        </div>
      )}
    </div>
  );
}
