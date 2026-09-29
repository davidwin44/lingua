import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNow } from '../state/hooks';
import { pronSessionsThisWeek } from '../lib/progress';
import { SR_UNSUPPORTED_MESSAGE, srSupported } from '../lib/speech';
import { ttsSupported } from '../lib/tts';
import { SpeakButton } from '../components/SpeakButton';
import { RecordButton } from '../components/RecordButton';
import { Icon } from '../components/Icon';

/**
 * Sound-focused pronunciation practice. Individual sounds benefit more from ASR feedback than
 * prosody (0.82 vs 0.37), and gains need weeks of steady practice (5-8 weeks: 1.01; 1-4 weeks:
 * 0.07), so the page shows sessions per week. Results never change review grades.
 */
export function Pronounce() {
  const { pack, progress } = useApp();
  const now = useNow(60_000);
  const sessions = pronSessionsThisWeek(progress, now);
  const sr = srSupported();
  const pairs = pack.pronunciation.filter((p) => p.kind === 'pair');
  const sounds = pack.pronunciation.filter((p) => p.kind === 'sound');

  return (
    <div className="page">
      <Link to="/speak" className="back-link">
        <Icon name="back" size={16} /> Speaking and writing
      </Link>
      <h1>Pronunciation</h1>
      {sr ? (
        <p className="lede">
          Listen, then record yourself. {sessions} session{sessions === 1 ? '' : 's'} this week. A few minutes several times a week works better
          than one long session.
        </p>
      ) : (
        <p className="note">{SR_UNSUPPORTED_MESSAGE}</p>
      )}
      {!ttsSupported() ? <p className="muted small">Audio playback isn’t available in this browser.</p> : null}

      <section className="section" aria-labelledby="pairs-title">
        <h2 id="pairs-title">Minimal pairs</h2>
        <p className="muted">Two words that differ in one sound, and the sound changes the meaning.</p>
        <ul className="plain-list-block">
          {pairs.map((item) => (
            <li key={item.id} className="pron-item">
              <div className="pair">
                {item.words.map((w) => (
                  <div key={w.text} className="pair-word">
                    <p className="pair-text" lang={pack.meta.ttsLang}>
                      {w.text} <SpeakButton text={w.text} />
                    </p>
                    <p className="muted small">{w.en}</p>
                    <RecordButton target={w.text} />
                  </div>
                ))}
              </div>
              <p className="small tip">{item.tip}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="sounds-title">
        <h2 id="sounds-title">Difficult sounds</h2>
        <ul className="plain-list-block">
          {sounds.map((item) => (
            <li key={item.id} className="pron-item">
              <h3>{item.title}</h3>
              <p className="small tip">{item.tip}</p>
              <ul className="sound-words">
                {item.words.map((w) => (
                  <li key={w.text}>
                    <p className="sound-word" lang={pack.meta.ttsLang}>
                      <strong>{w.text}</strong> <span className="muted small">{w.en}</span> <SpeakButton text={w.text} />
                    </p>
                    <RecordButton target={w.text} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
