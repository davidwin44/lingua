import { useId } from 'react';
import type { LangMeta } from '../content/types';

const W = 30;
const H = 20;

/**
 * A language's flag, drawn from the stripes in its pack meta. Drawn rather than an emoji
 * because Windows shows flag emoji as two letters.
 */
export function Flag({ flag, height = 16 }: { flag: LangMeta['flag']; height?: number }) {
  // useId returns ":r0:"-style ids; colons are unsafe inside url(#...), so drop them.
  const clip = `flag${useId().replace(/:/g, '')}`;
  const weights = flag.weights ?? flag.colors.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const vertical = flag.stripes === 'vertical';
  let at = 0;
  return (
    <svg className="flag" width={(height * W) / H} height={height} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <clipPath id={clip}>
        <rect width={W} height={H} rx="2.5" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {flag.colors.map((color, i) => {
          const size = ((vertical ? W : H) * weights[i]) / total;
          const rect = vertical ? { x: at, y: 0, width: size, height: H } : { x: 0, y: at, width: W, height: size };
          at += size;
          return <rect key={i} {...rect} fill={color} />;
        })}
      </g>
      {/* An outline in the text colour, so white stripes still show on a white page. */}
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="2" fill="none" stroke="currentColor" strokeOpacity="0.22" />
    </svg>
  );
}
