import type { ForecastDay } from '../lib/scheduler';

/**
 * 7-day projected review load as simple SVG bars. The solid bar is what will be shown
 * that day; the faint cap above it is load carried over from a capped backlog.
 */
export function ForecastChart({ days, cap }: { days: ForecastDay[]; cap: number }) {
  const W = 320;
  const H = 150;
  const top = 18;
  const bottom = 26;
  const plotH = H - top - bottom;
  const max = Math.max(5, ...days.map((d) => Math.max(d.shown, d.due)));
  const slot = W / days.length;
  const barW = Math.min(30, slot * 0.6);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const capY = cap < max ? y(cap) : null;

  return (
    <figure className="forecast">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={days.map((d) => `${d.label}: ${d.shown} reviews`).join(', ')}>
        <line x1="0" x2={W} y1={top + plotH} y2={top + plotH} className="axis" />
        {capY !== null ? (
          <>
            <line x1="0" x2={W} y1={capY} y2={capY} className="cap-line" />
            <text x={W - 2} y={capY - 4} textAnchor="end" className="cap-label">
              daily cap {cap}
            </text>
          </>
        ) : null}
        {days.map((d, i) => {
          const x = i * slot + (slot - barW) / 2;
          const hShown = (d.shown / max) * plotH;
          return (
            <g key={d.ts}>
              <rect x={x} y={y(d.shown)} width={barW} height={Math.max(hShown, d.shown > 0 ? 2 : 0)} rx="4" className={i === 0 ? 'bar bar-today' : 'bar'} />
              <text x={x + barW / 2} y={y(d.shown) - 5} textAnchor="middle" className="bar-value">
                {d.shown}
              </text>
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="bar-label">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
