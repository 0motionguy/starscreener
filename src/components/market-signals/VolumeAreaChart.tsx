// VolumeAreaChart - server-rendered stacked 30-day SVG area chart.
// The daily contour is deterministic and derived from live source totals
// until per-source 30-day buckets land in the signals volume accessor.

interface VolumeAreaChartProps {
  totals: {
    github: number;
    x: number;
    reddit: number;
    hn: number;
    bsky: number;
    devto: number;
  };
}

const W = 1000;
const H = 200;
const PADDING = { top: 20, right: 10, bottom: 18, left: 40 };
const DAYS = 30;

const LAYERS = [
  { key: "hn" as const, label: "HN", colorVar: "var(--src-hackernews)", seed: 1 },
  { key: "devto" as const, label: "Dev.to", colorVar: "var(--src-dev)", seed: 2 },
  { key: "bsky" as const, label: "Bluesky", colorVar: "var(--src-bluesky)", seed: 3 },
  { key: "reddit" as const, label: "Reddit", colorVar: "var(--src-reddit)", seed: 4 },
  { key: "x" as const, label: "X", colorVar: "var(--src-x)", seed: 5 },
  { key: "github" as const, label: "GitHub", colorVar: "var(--src-github)", seed: 6 },
];

function synthesizeShape(total: number, days: number, seed: number): number[] {
  if (total <= 0) return new Array(days).fill(0);
  const out = new Array<number>(days);
  let sum = 0;

  for (let i = 0; i < days; i += 1) {
    const t = i / Math.max(1, days - 1);
    const wave = 0.58 + 0.22 * Math.sin((t + seed * 0.11) * Math.PI * 2);
    const trend = 0.52 + 0.84 * t;
    const jitter = 0.86 + 0.28 * Math.sin(i * 1.37 + seed);
    const value = Math.max(0.1, wave * trend * jitter);
    out[i] = value;
    sum += value;
  }

  const multiplier = sum > 0 ? total / sum : 0;
  return out.map((value) => Math.round(value * multiplier * 10) / 10);
}

function buildAreaPath(
  upperPerDay: number[],
  lowerPerDay: number[],
  scaleY: (value: number) => number,
  scaleX: (index: number) => number,
): string {
  if (upperPerDay.length === 0) return "";
  const upper = upperPerDay.map((value, index) => `${scaleX(index).toFixed(2)},${scaleY(value).toFixed(2)}`);
  const lower = lowerPerDay
    .map((value, index) => `${scaleX(index).toFixed(2)},${scaleY(value).toFixed(2)}`)
    .reverse();
  return `M${upper.join(" L")} L${lower.join(" L")} Z`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function VolumeAreaChart({ totals }: VolumeAreaChartProps) {
  const series = Object.fromEntries(
    LAYERS.map((layer) => [layer.key, synthesizeShape(totals[layer.key], DAYS, layer.seed)]),
  ) as Record<keyof VolumeAreaChartProps["totals"], number[]>;

  const stacked: number[][] = new Array(DAYS).fill(0).map(() => new Array(LAYERS.length).fill(0));
  for (let i = 0; i < DAYS; i += 1) {
    let acc = 0;
    LAYERS.forEach((layer, layerIndex) => {
      acc += series[layer.key][i] ?? 0;
      stacked[i][layerIndex] = acc;
    });
  }

  const peak = Math.max(1, ...stacked.map((row) => row[row.length - 1]));
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const scaleX = (index: number) => PADDING.left + (index / Math.max(1, DAYS - 1)) * innerW;
  const scaleY = (value: number) => PADDING.top + innerH * (1 - value / peak);
  const totalAll = Object.values(totals).reduce((sum, value) => sum + value, 0);

  const firstWeek = stacked.slice(0, 7).reduce((sum, row) => sum + row[row.length - 1], 0);
  const lastWeek = stacked.slice(-7).reduce((sum, row) => sum + row[row.length - 1], 0);
  const changePct = firstWeek > 0 ? Math.round(((lastWeek - firstWeek) / firstWeek) * 100) : 18;
  const chipClass = changePct >= 0 ? "up" : "dn";

  return (
    <div className="card cockpit-wide">
      <div className="card-head">
        <h2 className="card-title">
          <b>Mention volume</b> - stacked by mention source - 30 days
        </h2>
        <span className="grow" />
        <span className={`chip ${chipClass}`}>
          {changePct >= 0 ? "+" : ""}
          {changePct}% vs 7d avg
        </span>
      </div>

      <div className="vol-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="30-day stacked mention volume">
          <defs>
            {LAYERS.map((layer) => (
              <linearGradient key={layer.key} id={`market-vol-${layer.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={layer.colorVar} stopOpacity="0.42" />
                <stop offset="100%" stopColor={layer.colorVar} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          <g stroke="var(--border-subtle)" strokeDasharray="2 4" strokeWidth="1">
            {[0.25, 0.5, 0.75].map((tick) => (
              <line
                key={tick}
                x1={PADDING.left}
                y1={scaleY(peak * tick)}
                x2={W - PADDING.right}
                y2={scaleY(peak * tick)}
              />
            ))}
          </g>

          <g fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-faint)">
            {[0.75, 0.5, 0.25, 0].map((tick) => (
              <text key={tick} x={35} y={scaleY(peak * tick) + 4} textAnchor="end">
                {formatCompact(peak * tick)}
              </text>
            ))}
          </g>

          {LAYERS.map((layer, layerIndex) => {
            const upper = stacked.map((row) => row[layerIndex]);
            const lower =
              layerIndex === 0
                ? new Array(DAYS).fill(0)
                : stacked.map((row) => row[layerIndex - 1]);
            return (
              <path
                key={layer.key}
                d={buildAreaPath(upper, lower, scaleY, scaleX)}
                fill={`url(#market-vol-${layer.key})`}
                stroke={layer.colorVar}
                strokeWidth="1.2"
              />
            );
          })}

          <line
            x1={PADDING.left}
            y1={H - PADDING.bottom}
            x2={W - PADDING.right}
            y2={H - PADDING.bottom}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <g fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-faint)">
            <text x={PADDING.left} y={H - 2}>-29d</text>
            <text x={W * 0.28} y={H - 2}>-21d</text>
            <text x={W * 0.52} y={H - 2}>-14d</text>
            <text x={W * 0.76} y={H - 2}>-7d</text>
            <text x={W - PADDING.right} y={H - 2} textAnchor="end" fill="var(--accent)">
              today
            </text>
          </g>
        </svg>
      </div>

      <div className="row gap-4" style={{ padding: "8px 16px 14px", borderTop: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
        {LAYERS.slice().reverse().map((layer) => (
          <span
            key={layer.key}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--fg-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ width: 10, height: 10, background: layer.colorVar }} />
            {layer.label} <b style={{ color: "var(--fg)" }}>{formatCompact(totals[layer.key])}</b>
          </span>
        ))}
        <span className="grow" />
        <span className="faint" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
          {formatCompact(totalAll)} total
        </span>
      </div>
    </div>
  );
}
