// V4 — CapitalFlowChart
//
// Pure-SVG stacked-area chart for funding.html § 01 "Capital flow · public
// comps". Same visual language as VolumeAreaChart but tinted for funding
// sectors (agents/infra/devtools/apps/data/security) and rendered on a
// 30-day axis instead of 24-hour.
//
// Data shape: an array of N daily points, each with one number per
// sector. Colors are passed in (caller controls the palette to match the
// active sector legend).
//
// Usage:
//   <CapitalFlowChart
//     points={[
//       { day: 0, sectors: { agents: 1100, infra: 900, devtools: 600, apps: 500, data: 400, security: 300 } },
//       ...
//     ]}
//     sectors={[
//       { key: "agents", label: "AGENTS", color: "var(--v4-violet)" },
//       { key: "infra", label: "INFRA", color: "var(--v4-money)" },
//       { key: "devtools", label: "DEVTOOLS", color: "var(--v4-cyan)" },
//       { key: "apps", label: "APPS", color: "var(--v4-blue)" },
//       { key: "data", label: "DATA", color: "var(--v4-amber)" },
//       { key: "security", label: "SECURITY", color: "var(--v4-pink)" },
//     ]}
//     todayLabel="$4.3B"
//     spike={{ index: 22, label: "▲ ANTHROPIC $2.0B" }}
//   />

import { cn } from "@/lib/utils";

export interface CapitalFlowSector {
  key: string;
  label: string;
  color: string;
}

export interface CapitalFlowPoint {
  /** Day index 0..N-1 (0 = oldest, N-1 = today). */
  day: number;
  /** Per-sector $ value for this day. */
  sectors: Record<string, number>;
}

export interface CapitalFlowChartProps {
  points: CapitalFlowPoint[];
  sectors: CapitalFlowSector[];
  /** Optional spike marker (vertical line + label) at a point index. */
  spike?: { index: number; label: string };
  /** Label rendered next to the today end-point (e.g. "$4.3B"). */
  todayLabel?: string;
  /** Width / height (SVG viewBox). Defaults match funding.html. */
  width?: number;
  height?: number;
  className?: string;
}

const DEFAULT_W = 880;
const DEFAULT_H = 280;
const PAD_L = 60;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 28;

export function CapitalFlowChart({
  points,
  sectors,
  spike,
  todayLabel,
  width = DEFAULT_W,
  height = DEFAULT_H,
  className,
}: CapitalFlowChartProps) {
  const innerW = width - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const N = points.length;

  if (N === 0 || sectors.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("v4-capital-flow", className)}
        preserveAspectRatio="none"
        role="img"
        aria-label="Capital flow chart — no data"
      />
    );
  }

  // Per-day total per sector (cumulative ladder for stacking).
  const cum: number[][] = sectors.map(() => new Array(N).fill(0));
  const totals: number[] = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let s = 0; s < sectors.length; s++) {
      acc += points[i].sectors[sectors[s].key] ?? 0;
      cum[s][i] = acc;
    }
    totals[i] = acc;
  }
  const max = Math.max(1, ...totals) * 1.06;

  const x = (i: number) =>
    N === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (N - 1)) * innerW;
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH;

  // Build paths: top-down so deepest layer renders last on top.
  const paths = sectors.map((s, idx) => {
    const top = cum[idx];
    const bot = idx === 0 ? new Array(N).fill(0) : cum[idx - 1];
    let d = "";
    for (let i = 0; i < N; i++) {
      d += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(top[i]).toFixed(1)} `;
    }
    for (let i = N - 1; i >= 0; i--) {
      d += `L${x(i).toFixed(1)},${y(bot[i]).toFixed(1)} `;
    }
    d += "Z";
    return { d, color: s.color };
  });

  // Gridlines: 5 horizontal at 0%, 25%, 50%, 75%, 100% of max.
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: y(max * t),
    label: `$${(max * (1 - t) / 1000).toFixed(1)}B`,
  }));

  // X labels every 5 days.
  const xLabels: number[] = [];
  for (let i = 0; i < N; i += 5) xLabels.push(i);

  // Top trend line (running total).
  let topLine = "";
  for (let i = 0; i < N; i++) {
    topLine += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(totals[i]).toFixed(1)} `;
  }

  const lastX = x(N - 1);
  const lastY = y(totals[N - 1]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("v4-capital-flow", className)}
      preserveAspectRatio="none"
      role="img"
      aria-label="Capital flow chart by sector"
      style={{ width: "100%", display: "block" }}
    >
      {/* gridlines */}
      {gridY.map((g, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            x2={width - PAD_R}
            y1={g.y}
            y2={g.y}
            stroke="rgba(255,255,255,0.05)"
          />
          <text
            x={PAD_L - 8}
            y={g.y + 3}
            textAnchor="end"
            fontFamily="var(--v4-mono)"
            fontSize="9.5"
            fill="var(--v4-ink-300)"
          >
            {gridY[i].label.replace("$0.0B", "$0").replace(`-`, "")}
          </text>
        </g>
      ))}

      {/* x labels */}
      {xLabels.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 10}
          textAnchor="middle"
          fontFamily="var(--v4-mono)"
          fontSize="9.5"
          fill="var(--v4-ink-300)"
          letterSpacing="0.10em"
        >
          D-{N - i}
        </text>
      ))}

      {/* stacked sector areas — render top-down so first sector is at bottom. */}
      {paths
        .map((p, idx) => ({ ...p, idx }))
        .reverse()
        .map((p) => (
          <path
            key={p.idx}
            d={p.d}
            fill={p.color}
            fillOpacity="0.6"
            stroke={p.color}
            strokeOpacity="0.5"
            strokeWidth="0.8"
          />
        ))}

      {/* trend line */}
      <path
        d={topLine}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.4"
      />

      {/* spike marker */}
      {spike && spike.index >= 0 && spike.index < N ? (
        <g>
          <line
            x1={x(spike.index)}
            x2={x(spike.index)}
            y1={PAD_T}
            y2={y(totals[spike.index])}
            stroke="var(--v4-acc)"
            strokeWidth="0.8"
            strokeDasharray="2 3"
            opacity="0.6"
          />
          <text
            x={x(spike.index) + 4}
            y={PAD_T + 10}
            fontFamily="var(--v4-mono)"
            fontSize="9"
            fill="var(--v4-acc)"
            letterSpacing="0.10em"
          >
            {spike.label}
          </text>
        </g>
      ) : null}

      {/* last-point dot + today label */}
      <circle
        cx={lastX}
        cy={lastY}
        r="4"
        fill="#fff"
        stroke="var(--v4-bg-000)"
        strokeWidth="1.5"
      />
      {todayLabel ? (
        <text
          x={lastX - 8}
          y={lastY - 10}
          textAnchor="end"
          fontFamily="var(--v4-mono)"
          fontSize="10"
          fill="var(--v4-ink-100)"
          letterSpacing="0.04em"
        >
          TODAY · {todayLabel}
        </text>
      ) : null}
    </svg>
  );
}
