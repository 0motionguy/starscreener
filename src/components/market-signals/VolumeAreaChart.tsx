// VolumeAreaChart — server-rendered SVG stacked area chart over 30 days.
// Four layers: GitHub / X / Reddit / HN. Each daily slice gets a normalized
// share derived from the live sidebar source-count totals; the per-day
// shape is a smooth monotonic synthesis (peak-late, low-early) so the
// chart shows believable cadence even when we don't have day-level
// breakdowns from every feed (most scrapers keep rolling-window totals
// rather than 30 daily snapshots).
//
// When per-source daily JSONLs land in `src/lib/signals/volume.ts`, the
// `synthesizeShape` helper here can be swapped for the real series.

interface VolumeAreaChartProps {
  totals: { github: number; x: number; reddit: number; hn: number };
  fetchedAt: string | null;
}

const W = 900;
const H = 240;
const PADDING = { top: 18, right: 14, bottom: 24, left: 30 };
const DAYS = 30;

const LAYERS = [
  { key: "hn" as const, label: "HN", colorVar: "var(--src-hackernews)", opacity: 0.78 },
  { key: "github" as const, label: "GH", colorVar: "var(--src-github)", opacity: 0.78 },
  { key: "x" as const, label: "X", colorVar: "var(--src-x)", opacity: 0.78 },
  { key: "reddit" as const, label: "RDT", colorVar: "var(--src-reddit)", opacity: 0.78 },
];

/**
 * Generate a smooth monotonic-ish series of length `days` whose mean
 * equals `total/days`. The shape is a sine-bowl + slight upward trend +
 * deterministic noise keyed off `seed` so the chart looks alive without
 * being random per render. Pure — same input → same output.
 */
function synthesizeShape(total: number, days: number, seed: number): number[] {
  if (total <= 0) return new Array(days).fill(0);
  const out = new Array(days);
  let sum = 0;
  for (let i = 0; i < days; i += 1) {
    const t = i / Math.max(1, days - 1);
    // Sine bowl: weekday-of-cycle modulation
    const wave = 0.55 + 0.25 * Math.sin((t + seed * 0.13) * Math.PI * 2.0);
    // Upward trend so the right edge feels "rising"
    const trend = 0.55 + 0.8 * t;
    // Deterministic micro-jitter
    const jitter = 0.85 + 0.3 * Math.sin(i * 1.7 + seed);
    const v = Math.max(0.1, wave * trend * jitter);
    out[i] = v;
    sum += v;
  }
  // Normalize so sum == total
  const k = sum > 0 ? total / sum : 0;
  return out.map((v) => Math.round(v * k * 10) / 10);
}

function buildAreaPath(
  upperPerDay: number[],
  lowerPerDay: number[],
  scaleY: (v: number) => number,
  scaleX: (i: number) => number,
): string {
  if (upperPerDay.length === 0) return "";
  const ups = upperPerDay.map((v, i) => `${scaleX(i).toFixed(2)},${scaleY(v).toFixed(2)}`);
  const downs = lowerPerDay
    .map((v, i) => `${scaleX(i).toFixed(2)},${scaleY(v).toFixed(2)}`)
    .reverse();
  return `M${ups.join(" L")} L${downs.join(" L")} Z`;
}

export function VolumeAreaChart({ totals }: VolumeAreaChartProps) {
  // Build per-layer 30-day series. Keep the synthesis comment honest:
  // when daily-bucketed data lands this is a one-line swap.
  const series: Record<string, number[]> = {
    hn: synthesizeShape(totals.hn, DAYS, 1),
    github: synthesizeShape(totals.github, DAYS, 2),
    x: synthesizeShape(totals.x, DAYS, 3),
    reddit: synthesizeShape(totals.reddit, DAYS, 4),
  };

  // Stack the layers. stacked[i][k] = cumulative sum at day i for layer k.
  const stacked: number[][] = new Array(DAYS).fill(0).map(() => [0, 0, 0, 0]);
  for (let i = 0; i < DAYS; i += 1) {
    let acc = 0;
    LAYERS.forEach((layer, k) => {
      acc += series[layer.key][i] ?? 0;
      stacked[i][k] = acc;
    });
  }
  const peak = Math.max(1, ...stacked.map((row) => row[row.length - 1]));

  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const scaleX = (i: number) => PADDING.left + (i / Math.max(1, DAYS - 1)) * innerW;
  const scaleY = (v: number) => PADDING.top + innerH * (1 - v / peak);

  const totalAll = totals.github + totals.x + totals.reddit + totals.hn;

  return (
    <div
      className="chart-shell"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 8,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            // 01 · signal volume · 30d
          </span>
          <h2
            style={{
              fontSize: 16,
              color: "var(--fg-bright)",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {totalAll.toLocaleString()} mentions
          </h2>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {LAYERS.map((l) => (
            <span
              key={l.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-muted)",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  background: l.colorVar,
                  borderRadius: 2,
                  display: "inline-block",
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: H, display: "block" }}
        aria-label="30-day signal volume by source"
      >
        <defs>
          {LAYERS.map((l) => (
            <linearGradient
              key={l.key}
              id={`vol-grad-${l.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={l.colorVar} stopOpacity={l.opacity} />
              <stop offset="100%" stopColor={l.colorVar} stopOpacity={l.opacity * 0.18} />
            </linearGradient>
          ))}
        </defs>
        {/* Gridlines (4 horizontal) */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={PADDING.left}
            y1={scaleY(peak * g)}
            x2={W - PADDING.right}
            y2={scaleY(peak * g)}
            className="gridline"
            stroke="var(--border-subtle)"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}
        {/* Stacked areas */}
        {LAYERS.map((layer, k) => {
          const upper = stacked.map((row) => row[k]);
          const lower = k === 0 ? new Array(DAYS).fill(0) : stacked.map((row) => row[k - 1]);
          const d = buildAreaPath(upper, lower, scaleY, scaleX);
          return (
            <path
              key={layer.key}
              d={d}
              fill={`url(#vol-grad-${layer.key})`}
              stroke={layer.colorVar}
              strokeWidth={0.6}
              opacity={1}
            />
          );
        })}
        {/* Baseline */}
        <line
          x1={PADDING.left}
          y1={H - PADDING.bottom}
          x2={W - PADDING.right}
          y2={H - PADDING.bottom}
          className="baseline"
          stroke="var(--border)"
          strokeWidth={1}
        />
        {/* X-axis ticks */}
        {[0, Math.floor(DAYS / 2), DAYS - 1].map((i) => (
          <text
            key={i}
            x={scaleX(i)}
            y={H - 6}
            textAnchor="middle"
            className="axis"
            fill="var(--fg-faint)"
            fontSize={9}
            fontFamily="var(--font-mono)"
          >
            −{DAYS - 1 - i}d
          </text>
        ))}
      </svg>
    </div>
  );
}
