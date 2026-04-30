"use client";

// Stacked area chart for the cross-source signal volume panel.
// Receives 24 hourly buckets from src/lib/signals/volume.ts and renders
// each source as its own coloured area. Recharts handles the stacking.

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader } from "@/components/ui/Card";
import { ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { HourBucket } from "@/lib/signals/volume";
import type { SourceKey } from "@/lib/signals/types";

const SOURCES: Array<{
  key: keyof HourBucket;
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
  const data = buckets.map((b) => ({
    hourLabel: formatHour(b.hour),
    hour: b.hour,
    hn: b.hn,
    github: b.github,
    x: b.x,
    reddit: b.reddit,
    bluesky: b.bluesky,
    devto: b.devto,
    claude: b.claude,
    openai: b.openai,
  }));

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
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
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
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="hourLabel"
              interval={3}
              tick={{
                fill: "var(--color-text-subtle)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-subtle)" }}
            />
            <YAxis
              tick={{
                fill: "var(--color-text-subtle)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-subtle)" }}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-accent)", strokeOpacity: 0.4 }}
              contentStyle={{
                background: "var(--color-bg-shell)",
                border: "1px solid var(--color-border-default)",
                borderRadius: 6,
                padding: "8px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
              labelStyle={{
                color: "var(--color-text-subtle)",
                letterSpacing: "0.10em",
              }}
            />
            {SOURCES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="1"
                stroke={s.color}
                strokeWidth={1}
                fill={`url(#vol-grad-${s.key})`}
                name={s.label}
                isAnimationActive={false}
              />
            ))}
            {peakTotal > 0 ? (
              <ReferenceLine
                x={formatHour(peakHour)}
                stroke="var(--color-accent)"
                strokeOpacity={0.7}
                strokeDasharray="2 3"
                label={{
                  value: `PEAK · ${peakTotal}`,
                  position: "insideTopRight",
                  fill: "var(--color-accent)",
                  fontSize: 9.5,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.10em",
                }}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
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
