// V2 design-system primitive — 180° arc confidence gauge.
// Renders a speedometer-style SVG arc from 0 → value (0–100).

interface ConfidenceGaugeProps {
  value: number;
  color?: string;
}

export function ConfidenceGauge({ value, color = "text-[var(--v4-money)]" }: ConfidenceGaugeProps): React.ReactElement {
  const R = 22;
  const W = R * 2 + 6;
  const H = R + 6;
  const cx = W / 2;
  const cy = H;
  const start = -Math.PI;
  const end = 0;

  const arc = (t: number) => {
    const a = start + (end - start) * t;
    return {
      x: cx + Math.cos(a) * R,
      y: cy + Math.sin(a) * R,
    };
  };

  const p0 = arc(0);
  const pEnd = arc(1);
  const pCur = arc(Math.min(1, Math.max(0, value / 100)));

  const bgD = `M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${pEnd.x} ${pEnd.y}`;
  const fgD = `M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${pCur.x} ${pCur.y}`;

  return (
    <div className="inline-flex items-center gap-2">
      <svg width={W} height={H + 2} viewBox={`0 0 ${W} ${H + 2}`} aria-hidden>
        <path
          d={bgD}
          className="fill-none stroke-border-primary"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d={fgD}
          className={`fill-none stroke-current ${color}`}
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px currentColor)" }}
        />
        <circle cx={pCur.x} cy={pCur.y} r="2.5" className={`fill-current ${color}`} />
      </svg>
      <div className="flex flex-col items-start leading-tight">
        <span className={`font-mono text-lg font-bold tabular-nums ${color}`}>
          {value}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
          confidence
        </span>
      </div>
    </div>
  );
}
