"use client";

// Stacked area chart + per-source rail for the cross-source signal volume
// panel. Receives 24 hourly buckets from src/lib/signals/volume.ts and
// renders each source as its own coloured area without a charting runtime.
//
// The rail below the chart exists because one source (Reddit, typically)
// can dominate ~95% of total volume and visually crush the other 7 areas
// into an invisible strip. The rail surfaces every source's individual
// shape, count, and within-window momentum so no source is hidden.

import { Card, CardHeader } from "@/components/ui/Card";
import { ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { HourBucket } from "@/lib/signals/volume";
import type { SourceKey } from "@/lib/signals/types";
import { SourceMark, SOURCE_BRAND_COLOR } from "./SourceMark";

type VolumeSourceKey = Exclude<keyof HourBucket, "hour" | "total">;

const SOURCES: Array<{
  key: VolumeSourceKey;
  src: SourceKey;
  label: string;
  color: string;
}> = [
  { key: "hn",      src: "hn",      label: "HN",      color: "var(--source-hackernews)" },
  { key: "github",  src: "github",  label: "GitHub",  color: "var(--source-github)" },
  { key: "x",       src: "x",       label: "X",       color: "var(--source-x)" },
  { key: "reddit",  src: "reddit",  label: "Reddit",  color: "var(--source-reddit)" },
  { key: "bluesky", src: "bluesky", label: "Bluesky", color: "var(--source-bluesky)" },
  { key: "devto",   src: "devto",   label: "Dev.to",  color: "var(--source-dev)" },
  { key: "claude",  src: "claude",  label: "Claude",  color: "var(--source-claude)" },
  { key: "openai",  src: "openai",  label: "OpenAI",  color: "var(--source-openai)" },
];

const SOURCE_NAMES: Record<SourceKey, string> = {
  hn: "Hacker News",
  github: "GitHub",
  x: "X / Twitter",
  reddit: "Reddit",
  bluesky: "Bluesky",
  devto: "Dev.to",
  claude: "Claude RSS",
  openai: "OpenAI RSS",
};

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function compactNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const CHART_W = 720;
const CHART_H = 220;
const PAD = { top: 10, right: 14, bottom: 26, left: 38 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

function xFor(index: number, count: number): number {
  if (count <= 1) return PAD.left;
  return PAD.left + (index / (count - 1)) * PLOT_W;
}

function yFor(value: number, max: number): number {
  if (max <= 0) return PAD.top + PLOT_H;
  return PAD.top + PLOT_H - (value / max) * PLOT_H;
}

function buildAreaPath(
  buckets: HourBucket[],
  key: VolumeSourceKey,
  lowerTotals: number[],
  maxTotal: number,
): string {
  const top: string[] = [];
  const bottom: string[] = [];

  buckets.forEach((bucket, index) => {
    const x = xFor(index, buckets.length);
    const lower = lowerTotals[index] ?? 0;
    const upper = lower + bucket[key];
    lowerTotals[index] = upper;
    top.push(`${x.toFixed(1)},${yFor(upper, maxTotal).toFixed(1)}`);
    bottom.push(`${x.toFixed(1)},${yFor(lower, maxTotal).toFixed(1)}`);
  });

  return `M ${top.join(" L ")} L ${bottom.reverse().join(" L ")} Z`;
}

function buildTotalLine(buckets: HourBucket[], maxTotal: number): string {
  if (buckets.length === 0) return "";
  return buckets
    .map((b, i) => {
      const x = xFor(i, buckets.length);
      const y = yFor(b.total, maxTotal);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// Mini-sparkline (rail row) — 24 hourly counts → small SVG path.
const RAIL_W = 78;
const RAIL_H = 18;

function buildSparkline(values: number[]): {
  line: string;
  fill: string;
  lastX: number;
  lastY: number;
} {
  if (values.length === 0) {
    return { line: "", fill: "", lastX: 0, lastY: RAIL_H };
  }
  const max = Math.max(...values, 1);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = (i / Math.max(1, values.length - 1)) * (RAIL_W - 2) + 1;
    const y = RAIL_H - 1 - (values[i] / max) * (RAIL_H - 3);
    xs.push(x);
    ys.push(y);
  }
  const line = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  const fill = `${line} L${xs[xs.length - 1].toFixed(1)},${RAIL_H} L${xs[0].toFixed(1)},${RAIL_H} Z`;
  return { line, fill, lastX: xs[xs.length - 1], lastY: ys[ys.length - 1] };
}

// Within-window momentum: compare second half vs first half of the
// 24-bucket array. Returns signed % change. Null when too sparse.
function momentumPct(values: number[]): number | null {
  if (values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  let first = 0;
  let second = 0;
  for (let i = 0; i < half; i++) first += values[i];
  for (let i = half; i < values.length; i++) second += values[i];
  if (first === 0 && second === 0) return null;
  if (first === 0) return 100;
  return Math.round(((second - first) / first) * 100);
}

export interface VolumeAreaChartProps {
  buckets: HourBucket[];
  totalItems: number;
  changePct: number | null;
  peakHour: number;
  peakTotal: number;
  quietHour: number;
  quietTotal: number;
  dominantSource: SourceKey;
  dominantPct: number;
}

export function VolumeAreaChart({
  buckets,
  totalItems,
  changePct,
  peakHour,
  peakTotal,
  quietHour,
  quietTotal,
  dominantSource,
  dominantPct,
}: VolumeAreaChartProps) {
  const lowerTotals = buckets.map(() => 0);
  const maxTotal = Math.max(1, peakTotal, ...buckets.map((b) => b.total));
  const peakIndex = Math.max(
    0,
    buckets.findIndex((bucket) => bucket.hour === peakHour),
  );
  const peakX = xFor(peakIndex, buckets.length);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = buckets.filter((_, index) => index % 4 === 0);
  const totalLinePath = buildTotalLine(buckets, maxTotal);

  const deltaText =
    changePct === null ? "Δ N/A" : `Δ ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;

  // Per-source rail data: hourly array + 24h total + within-window momentum.
  const railRows = SOURCES.map((s) => {
    const values = buckets.map((b) => b[s.key]);
    const total = values.reduce((sum, v) => sum + v, 0);
    return {
      ...s,
      values,
      total,
      momentum: momentumPct(values),
    };
  });

  // Derived indicators.
  // Hourly velocity = signals/hour at peak (already in peakTotal).
  // Source spread = how many sources contributed > 5% of the total.
  const sourceSpread = totalItems > 0
    ? railRows.filter((r) => r.total / totalItems > 0.05).length
    : 0;
  // Window-wide momentum (sum of all sources) — same first-vs-second-half logic.
  const totals = buckets.map((b) => b.total);
  const overallMomentum = momentumPct(totals);

  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader
        showCorner
        right={
          <>
            <span>{deltaText}</span>
            <span className="live">LIVE</span>
          </>
        }
      >
        <span>{"// 01 SIGNAL VOLUME"}</span>
        <span style={{ color: "var(--color-text-subtle)", marginLeft: "8px" }}>
          · STACKED · 24H · BY SOURCE
        </span>
      </CardHeader>

      <ChartWrap variant="chart" style={{ minHeight: 220 }}>
        <svg
          role="img"
          aria-label="24 hour signal volume stacked by source"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: 220 }}
        >
          <defs>
            {SOURCES.map((s) => (
              <linearGradient
                key={s.key}
                id={`vol-grad-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.35} />
              </linearGradient>
            ))}
          </defs>

          {yTicks.map((tick) => {
            const y = yFor(maxTotal * tick, maxTotal);
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={CHART_W - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                />
                <text
                  x={PAD.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-text-subtle)"
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                >
                  {Math.round(maxTotal * tick)}
                </text>
              </g>
            );
          })}

          <line
            x1={PAD.left}
            x2={CHART_W - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
            stroke="var(--color-border-subtle)"
          />

          {SOURCES.map((s) => (
            <path
              key={s.key}
              d={buildAreaPath(buckets, s.key, lowerTotals, maxTotal)}
              fill={`url(#vol-grad-${s.key})`}
              stroke={s.color}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Total silhouette on top of the stack — keeps the overall shape
              visible even when one source dominates 95% of volume. */}
          {totalLinePath ? (
            <path
              d={totalLinePath}
              fill="none"
              stroke="var(--color-text-default)"
              strokeWidth="1.4"
              strokeOpacity="0.85"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {peakTotal > 0 ? (
            <g>
              <line
                x1={peakX}
                x2={peakX}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--color-accent)"
                strokeOpacity="0.75"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={Math.min(CHART_W - PAD.right - 4, peakX + 8)}
                y={PAD.top + 14}
                fill="var(--color-accent)"
                fontFamily="var(--font-mono)"
                fontSize="10"
                letterSpacing="1.2"
              >
                PEAK {peakTotal}
              </text>
            </g>
          ) : null}

          {xTicks.map((bucket, index) => (
            <text
              key={bucket.hour}
              x={xFor(index * 4, buckets.length)}
              y={CHART_H - 8}
              textAnchor="middle"
              fill="var(--color-text-subtle)"
              fontFamily="var(--font-mono)"
              fontSize="10"
            >
              {formatHour(bucket.hour)}
            </text>
          ))}
        </svg>
      </ChartWrap>

      {/* Per-source rail — every source surfaces its own shape, count, and
          within-window momentum even when stacked-area is dominated by one. */}
      <div className="vol-rail">
        {railRows.map((r) => {
          const { line, fill, lastX, lastY } = buildSparkline(r.values);
          const sharePct = totalItems > 0 ? (r.total / totalItems) * 100 : 0;
          const mom = r.momentum;
          const momText =
            mom === null ? "—" : `${mom >= 0 ? "+" : ""}${mom}%`;
          const momColor =
            mom === null
              ? "var(--color-text-faint)"
              : mom > 0
                ? "var(--color-positive)"
                : mom < 0
                  ? "var(--color-negative)"
                  : "var(--color-text-subtle)";
          return (
            <div key={r.key} className="vol-rail-row">
              <span
                className="vol-rail-mark"
                style={{
                  background: `color-mix(in srgb, ${SOURCE_BRAND_COLOR[r.src]} 22%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${SOURCE_BRAND_COLOR[r.src]} 55%, transparent)`,
                  color: SOURCE_BRAND_COLOR[r.src],
                }}
              >
                <SourceMark source={r.src} size={11} monochrome />
              </span>
              <span className="vol-rail-label">{r.label}</span>
              <span className="vol-rail-count">{compactNumber(r.total)}</span>
              <span className="vol-rail-share">{sharePct.toFixed(1)}%</span>
              <span className="vol-rail-mom" style={{ color: momColor }}>
                {momText}
              </span>
              <svg
                className="vol-rail-spark"
                viewBox={`0 0 ${RAIL_W} ${RAIL_H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {fill ? (
                  <path
                    d={fill}
                    fill={`color-mix(in srgb, ${SOURCE_BRAND_COLOR[r.src]} 28%, transparent)`}
                    stroke="none"
                  />
                ) : null}
                {line ? (
                  <path
                    d={line}
                    fill="none"
                    stroke={SOURCE_BRAND_COLOR[r.src]}
                    strokeWidth={1.3}
                  />
                ) : null}
                {line && r.total > 0 ? (
                  <circle
                    cx={lastX.toFixed(1)}
                    cy={lastY.toFixed(1)}
                    r={1.8}
                    fill={SOURCE_BRAND_COLOR[r.src]}
                    stroke="var(--color-bg-shell)"
                    strokeWidth={0.8}
                  />
                ) : null}
              </svg>
            </div>
          );
        })}
      </div>

      <ChartStats columns={6}>
        <ChartStat
          label="Peak hour"
          value={`${formatHour(peakHour)} UTC`}
          sub={`${peakTotal.toLocaleString("en-US")} signals`}
        />
        <ChartStat
          label="Quietest"
          value={`${formatHour(quietHour)} UTC`}
          sub={`${quietTotal.toLocaleString("en-US")} signals`}
        />
        <ChartStat
          label="Dominant source"
          value={SOURCE_NAMES[dominantSource]}
          sub={
            <span style={{ color: SOURCE_BRAND_COLOR[dominantSource] }}>
              {dominantPct.toFixed(1)}% of total
            </span>
          }
        />
        <ChartStat
          label="Hourly velocity"
          value={`${peakTotal}/h`}
          sub="at peak hour"
        />
        <ChartStat
          label="Source spread"
          value={`${sourceSpread} / 8`}
          sub=">5% share"
        />
        <ChartStat
          label="Momentum"
          value={
            <span
              style={{
                color:
                  overallMomentum === null
                    ? "var(--color-text-faint)"
                    : overallMomentum > 0
                      ? "var(--color-positive)"
                      : overallMomentum < 0
                        ? "var(--color-negative)"
                        : "var(--color-text-default)",
              }}
            >
              {overallMomentum === null
                ? "—"
                : `${overallMomentum >= 0 ? "+" : ""}${overallMomentum}%`}
            </span>
          }
          sub="2nd half vs 1st"
        />
      </ChartStats>

      <span style={{ display: "none" }}>{totalItems}</span>
    </Card>
  );
}

export default VolumeAreaChart;
