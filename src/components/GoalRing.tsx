/** Weekly goal ring (used instead of a daily streak — a missed day never "breaks" anything). */
export function GoalRing({ fraction, value, target, unit }: { fraction: number; value: number; target: number; unit: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <svg
      className="goal-ring"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${value} of ${target} ${unit} this week`}
    >
      <circle cx="50" cy="50" r={r} className="ring-track" />
      {/* No arc at zero: a round cap on an empty arc would still draw a dot. */}
      {f > 0 ? (
        <circle
          cx="50"
          cy="50"
          r={r}
          className="ring-fill"
          strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 50 50)"
        />
      ) : null}
      <text x="50" y="49" textAnchor="middle" className="ring-value">
        {value}
      </text>
      <text x="50" y="64" textAnchor="middle" className="ring-label">
        of {target} {unit}
      </text>
    </svg>
  );
}
