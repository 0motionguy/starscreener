"use client";

// Client-side Recharts islands for the model-usage page.
//
// Each chart is a thin wrapper around ResponsiveContainer + a single
// Recharts type so the parent server component decides which chart to
// render but the heavy interaction code stays client-only.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DayPoint {
  day: string;
  value: number;
  /** Optional second-series value (e.g. errors over events). */
  value2?: number;
}

const AXIS_FILL = "var(--color-text-secondary, #8b9097)";
const GRID_STROKE = "var(--color-border-subtle, #1f2329)";
const ACCENT = "var(--color-accent, #ff6b35)";
const POSITIVE = "var(--color-positive, #22c55e)";
const WARNING = "var(--color-warning, #ffb547)";
const NEGATIVE = "var(--color-negative, #ef4444)";

// ---------------------------------------------------------------------------
// Cost — stacked bar by-model 30d (top 5 models + 'other').
// ---------------------------------------------------------------------------

interface CostStackedSeries {
  day: string;
  [modelId: string]: number | string;
}

interface CostStackedProps {
  data: CostStackedSeries[];
  models: string[];
}

const STACK_COLORS = [
  ACCENT,
  POSITIVE,
  WARNING,
  "var(--color-source-bluesky, #4a90e2)",
  "var(--color-source-reddit, #ff4500)",
  "var(--color-source-hackernews, #ff6600)",
];

export function CostStackedChart({ data, models }: CostStackedProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="day" fontSize={10} stroke={AXIS_FILL} tickLine={false} axisLine={false} />
        <YAxis
          fontSize={10}
          stroke={AXIS_FILL}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v < 1 ? v.toFixed(2) : Math.round(v)}`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => `$${Number(v ?? 0).toFixed(4)}`}
        />
        {models.map((m, i) => (
          <Bar
            key={m}
            dataKey={m}
            stackId="cost"
            fill={STACK_COLORS[i % STACK_COLORS.length]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Latency — p50 + p95 lines.
// ---------------------------------------------------------------------------

export function LatencyLineChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="day" fontSize={10} stroke={AXIS_FILL} tickLine={false} axisLine={false} />
        <YAxis
          fontSize={10}
          stroke={AXIS_FILL}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => `${v ?? 0}ms`}
        />
        <Line
          type="monotone"
          dataKey="value"
          name="p50"
          stroke={POSITIVE}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value2"
          name="p95"
          stroke={WARNING}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Reliability — error rate area.
// ---------------------------------------------------------------------------

export function ReliabilityAreaChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="day" fontSize={10} stroke={AXIS_FILL} tickLine={false} axisLine={false} />
        <YAxis
          fontSize={10}
          stroke={AXIS_FILL}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => `${(Number(v ?? 0) * 100).toFixed(2)}%`}
        />
        <Area
          type="monotone"
          dataKey="value"
          name="error rate"
          stroke={NEGATIVE}
          fill={NEGATIVE}
          fillOpacity={0.2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Events trend — area.
// ---------------------------------------------------------------------------

export function EventsAreaChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="day" fontSize={10} stroke={AXIS_FILL} tickLine={false} axisLine={false} />
        <YAxis fontSize={10} stroke={AXIS_FILL} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="value"
          name="events"
          stroke={ACCENT}
          fill={ACCENT}
          fillOpacity={0.25}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const tooltipStyle = {
  backgroundColor: "var(--color-bg-canvas, #08090a)",
  border: "1px solid var(--color-border-subtle, #1f2329)",
  borderRadius: 4,
  fontSize: 12,
};
