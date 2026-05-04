"use client";

// Stacked area chart for the cross-source signal volume panel.
// Receives 24 hourly buckets from src/lib/signals/volume.ts and renders
// each source as its own coloured area without a charting runtime.

import { Card, CardHeader } from "@/components/ui/Card";
import { ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { HourBucket } from "@/lib/signals/volume";
import type { SourceKey } from "@/lib/signals/types";

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

const CHART_W = 720;
const CHART_H = 240;
const PAD = { top: 12, right: 14, bottom: 28, left: 38 };
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

  const deltaText =
    changePct === null ? "Δ N/A" : `Δ ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;

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

      <ChartWrap variant="chart" style={{ minHeight: 240 }}>
        <svg
          role="img"
          aria-label="24 hour signal volume stacked by source"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: 240 }}
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
              y={CHART_H - 9}
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

      {/* Legend strip */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          padding: "0 14px 10px",
          flexWrap: "wrap",
          fontSize: 11,
          letterSpacing: "0.14em",
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
        }}
      >
        {SOURCES.map((s) => (
          <span
            key={s.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <i
              style={{
                width: 10,
                height: 3,
                background: s.color,
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <ChartStats columns={3}>
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
            <span
              style={{
                color: `var(--source-${dominantSourceColorToken(dominantSource)})`,
              }}
            >
              {dominantPct.toFixed(1)}% of total
            </span>
          }
        />
      </ChartStats>

      <span style={{ display: "none" }}>
        {totalItems /* referenced for completeness; rendered as KPI elsewhere */}
      </span>
    </Card>
  );
}

function dominantSourceColorToken(key: SourceKey): string {
  switch (key) {
    case "hn":
      return "hackernews";
    case "github":
      return "github";
    case "x":
      return "x";
    case "reddit":
      return "reddit";
    case "bluesky":
      return "bluesky";
    case "devto":
      return "dev";
    case "claude":
      return "claude";
    case "openai":
      return "openai";
  }
}

export default VolumeAreaChart;
