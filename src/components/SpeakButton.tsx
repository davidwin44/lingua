import { useSpeak, ttsSupported } from '../state/hooks';
import { Icon } from './Icon';

/** Play target-language text with speechSynthesis. Renders nothing when TTS is unsupported. */
export function SpeakButton({ text, label, className = '' }: { text: string; label?: string; className?: string }) {
  const say = useSpeak();
  if (!ttsSupported()) return null;
  return (
    <button
      type="button"
      className={`${label ? 'btn btn-ghost btn-sm' : 'icon-btn'} ${className}`}
      onClick={() => say(text)}
      aria-label={`Listen: ${text}`}
      title="Listen"
    >
      <Icon name="volume" size={18} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
