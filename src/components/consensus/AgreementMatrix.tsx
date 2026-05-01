import type { ConsensusItem, ConsensusVerdictBand } from "@/lib/consensus-trending";

// V4 token mapping — exact hex matches in design/v4/tokens.css:
//   strong_consensus → --v4-money   (#22c55e, "firing/live-good")
//   early_call       → --v4-violet  (#a78bfa, decorative)
//   divergence       → --v4-amber   (#ffb547, "warn")
//   external_only    → --v4-blue    (#60a5fa, decorative)
//   single_source    → --v4-ink-300 (#84909b, muted)
const BAND_COLOR: Record<ConsensusVerdictBand, string> = {
  strong_consensus: "var(--v4-money)",
  early_call: "var(--v4-violet)",
  divergence: "var(--v4-amber)",
  external_only: "var(--v4-blue)",
  single_source: "var(--v4-ink-300)",
};

const W = 880;
const H = 480;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 36;
const innerW = W - PAD_L - PAD_R;
const innerH = H - PAD_T - PAD_B;

const MAX_RANK = 100;

function x(rank: number): number {
  const r = Math.min(MAX_RANK, Math.max(1, rank));
  return PAD_L + ((r - 1) / (MAX_RANK - 1)) * innerW;
}
function y(rank: number): number {
  const r = Math.min(MAX_RANK, Math.max(1, rank));
  return PAD_T + ((r - 1) / (MAX_RANK - 1)) * innerH;
}

interface AgreementMatrixProps {
  items: ConsensusItem[];
  /** Top-N to label. Default 14. */
  labelCount?: number;
}

export function AgreementMatrix({ items, labelCount = 14 }: AgreementMatrixProps) {
  // Filter to items with both ranks present (or at least one usable rank).
  const plottable = items
    .map((item, idx) => {
      const oursRank = item.oursRank ?? null;
      const externalRank = item.externalRank ?? null;
      // Skip if both null.
      if (oursRank == null && externalRank == null) return null;
      return {
        ...item,
        plotOurs: oursRank ?? Math.min(MAX_RANK, item.rank + 60), // Off-axis if no ours rank.
        plotExternal: externalRank ?? Math.min(MAX_RANK, item.rank + 60),
        size: Math.max(3, Math.min(14, 10 - Math.log10(idx + 2) * 2)),
        color: BAND_COLOR[item.verdict],
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Pick the top labels: high-rank consensus + early_call + divergence.
  const labeled = plottable
    .slice()
    .sort((a, b) => {
      const rankA = a.verdict === "strong_consensus" ? 0 : a.verdict === "early_call" ? 1 : a.verdict === "divergence" ? 2 : 3;
      const rankB = b.verdict === "strong_consensus" ? 0 : b.verdict === "early_call" ? 1 : b.verdict === "divergence" ? 2 : 3;
      if (rankA !== rankB) return rankA - rankB;
      return b.consensusScore - a.consensusScore;
    })
    .slice(0, labelCount);
  const labeledIds = new Set(labeled.map((d) => d.fullName));

  // Gridlines + axis ticks at 1, 25, 50, 75, 100
  const TICKS = [1, 25, 50, 75, 100];

  return (
    <div className="matrix-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Agreement matrix scatter">
        {/* Gridlines */}
        {TICKS.map((t) => (
          <g key={`tick-${t}`}>
            <line x1={x(t)} y1={PAD_T} x2={x(t)} y2={PAD_T + innerH} stroke="rgba(255,255,255,0.05)" />
            <line x1={PAD_L} y1={y(t)} x2={W - PAD_R} y2={y(t)} stroke="rgba(255,255,255,0.05)" />
            <text x={x(t)} y={H - 12} textAnchor="middle" fontFamily="JetBrains Mono, ui-monospace" fontSize={9.5} fill="var(--v4-ink-300)">
              #{t}
            </text>
            <text x={PAD_L - 8} y={y(t) + 3} textAnchor="end" fontFamily="JetBrains Mono, ui-monospace" fontSize={9.5} fill="var(--v4-ink-300)">
              #{t}
            </text>
          </g>
        ))}

        {/* Consensus polygon shading (close to diagonal) */}
        <polygon
          points={`${x(1)},${y(1)} ${x(15)},${y(1)} ${x(100)},${y(85)} ${x(100)},${y(100)} ${x(85)},${y(100)} ${x(1)},${y(15)}`}
          fill="rgba(34,197,94,0.06)"
          stroke="none"
        />

        {/* Diagonal — perfect agreement */}
        <line
          x1={x(1)}
          y1={y(1)}
          x2={x(100)}
          y2={y(100)}
          stroke="rgba(34,197,94,0.35)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <text
          x={x(100) - 6}
          y={y(100) - 8}
          textAnchor="end"
          fontFamily="JetBrains Mono, ui-monospace"
          fontSize={9}
          fill="var(--v4-money)"
          letterSpacing="0.18em"
        >
          PERFECT AGREEMENT →
        </text>

        {/* Axis labels */}
        <text x={PAD_L} y={H - 2} fontFamily="JetBrains Mono, ui-monospace" fontSize={9} fill="var(--v4-ink-300)" letterSpacing="0.18em">
          OURS RANK · 1 → 100 →
        </text>
        <text
          x={PAD_L - 44}
          y={PAD_T + 10}
          fontFamily="JetBrains Mono, ui-monospace"
          fontSize={9}
          fill="var(--v4-ink-300)"
          letterSpacing="0.18em"
        >
          ↑ EXTERNAL
        </text>

        {/* Quadrant legends */}
        <text x={PAD_L + 8} y={PAD_T + 14} fontFamily="JetBrains Mono, ui-monospace" fontSize={9} fill="var(--v4-violet)" letterSpacing="0.18em">
          ▲ EARLY CALLS
        </text>
        <text
          x={W - PAD_R - 8}
          y={PAD_T + 14}
          textAnchor="end"
          fontFamily="JetBrains Mono, ui-monospace"
          fontSize={9}
          fill="var(--v4-blue)"
          letterSpacing="0.18em"
        >
          EXTERNAL-ONLY ▲
        </text>
        <text
          x={W - PAD_R - 8}
          y={PAD_T + innerH - 6}
          textAnchor="end"
          fontFamily="JetBrains Mono, ui-monospace"
          fontSize={9}
          fill="var(--v4-ink-300)"
          letterSpacing="0.18em"
        >
          SINGLE / LATE
        </text>

        {/* Background dots */}
        {plottable
          .filter((d) => !labeledIds.has(d.fullName))
          .map((d) => (
            <circle
              key={d.fullName}
              cx={x(d.plotOurs).toFixed(1)}
              cy={y(d.plotExternal).toFixed(1)}
              r={(d.size * 0.7).toFixed(1)}
              fill={d.color}
              opacity={0.45}
              stroke="var(--v4-bg-000)"
              strokeWidth={0.7}
            />
          ))}

        {/* Featured dots with labels */}
        {labeled.map((d, i) => {
          const cx = x(d.plotOurs);
          const cy = y(d.plotExternal);
          const r = d.size;
          const isTop = i === 0;
          const labelY = cy - r - 5;
          const labelText = d.fullName.length > 28 ? d.fullName.slice(0, 26) + "…" : d.fullName;
          return (
            <g key={d.fullName}>
              <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={r} fill={d.color} stroke="var(--v4-bg-000)" strokeWidth={1.5} />
              {isTop ? (
                <circle
                  cx={cx.toFixed(1)}
                  cy={cy.toFixed(1)}
                  r={r + 5}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={1}
                  opacity={0.5}
                />
              ) : null}
              <text
                x={cx.toFixed(1)}
                y={labelY.toFixed(1)}
                textAnchor="middle"
                fontFamily="JetBrains Mono, ui-monospace"
                fontSize={9.5}
                fill="var(--v4-ink-100)"
                letterSpacing="0.04em"
              >
                {labelText}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
