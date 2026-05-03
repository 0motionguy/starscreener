"use client";

// TR-100 Index area chart — replaces the spiky inline-SVG sparkline that
// used to sit in section // 06 of /. The user complaint ("SHITTY CHARTS")
// was about that inline `<path>`: no gradient fill, no grid, no tooltip,
// data sliced as `[...flatMap(spark.slice(-2)).slice(-30)]` which jammed
// 30 unrelated repos' last-2-day deltas into a single line and produced
// the cliff-edge zigzag in the prod screenshot.
//
// This component takes the same top-N repos and aggregates them into one
// honest 30-day index series (sum of cumulative stars across the basket
// per day), then renders a Recharts AreaChart with a brand gradient,
// grid lines, normalized y-axis, real date ticks, and a hover tooltip.
//
// Client island because Recharts is a client-only render path. The parent
// passes a serializable `points` array — no Repo[] over the wire.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface Tr100Point {
  /** UTC ms timestamp at start of day. */
  ts: number;
  /** Aggregate cumulative stars across the basket for that day. */
  value: number;
}

interface Props {
  points: Tr100Point[];
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatTick(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface TooltipEntry {
  payload?: Tr100Point;
}

function IndexTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const dateLabel = new Date(point.ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div
      style={{
        background: "var(--bg-000, #0a0a0a)",
        border: "1px solid var(--line-300, #2a2a2a)",
        padding: "8px 10px",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
        color: "var(--ink-100, #f6f9fc)",
        letterSpacing: "0.08em",
      }}
    >
      <div style={{ color: "var(--ink-400, #8a8a8a)", marginBottom: 4, textTransform: "uppercase" }}>
        {dateLabel}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ textTransform: "uppercase" }}>Index</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatCompact(point.value)}
        </span>
      </div>
    </div>
  );
}

export function Tr100IndexChart({ points }: Props) {
  // Normalize: drop any non-finite values so a single bad row doesn't
  // crash the line to zero (this was the root of the cliff-edge spike
  // in the original SSR sparkline).
  const data = useMemo(
    () => points.filter((p) => Number.isFinite(p.value) && p.value > 0),
    [points],
  );

  if (data.length < 2) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 280,
          color: "var(--ink-400, #8a8a8a)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Index warming up — collecting daily snapshots...
      </div>
    );
  }

  const min = Math.min(...data.map((p) => p.value));
  const max = Math.max(...data.map((p) => p.value));
  // Pad domain by ~3 % top/bottom so the line never kisses the chart edge.
  const span = Math.max(1, max - min);
  const yMin = Math.max(0, Math.floor(min - span * 0.03));
  const yMax = Math.ceil(max + span * 0.03);

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 14, right: 18, bottom: 8, left: 4 }}
        >
          <defs>
            <linearGradient id="tr100-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--acc, #ff6a00)" stopOpacity={0.4} />
              <stop offset="60%" stopColor="var(--acc, #ff6a00)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--acc, #ff6a00)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--line-200, #1f1f1f)"
            strokeOpacity={0.6}
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTick}
            interval="preserveStartEnd"
            minTickGap={48}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: "var(--ink-400, #8a8a8a)",
              fontSize: 10,
              fontFamily: "var(--font-mono), monospace",
              letterSpacing: "0.12em",
            }}
            dy={6}
          />
          <YAxis
            type="number"
            domain={[yMin, yMax]}
            tickFormatter={formatCompact}
            tickCount={5}
            axisLine={false}
            tickLine={false}
            width={48}
            tick={{
              fill: "var(--ink-400, #8a8a8a)",
              fontSize: 10,
              fontFamily: "var(--font-mono), monospace",
              letterSpacing: "0.12em",
            }}
          />
          <Tooltip
            content={IndexTooltip as never}
            cursor={{
              stroke: "var(--line-300, #2a2a2a)",
              strokeDasharray: "2 4",
              strokeOpacity: 0.7,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--acc, #ff6a00)"
            strokeWidth={2}
            fill="url(#tr100-fill)"
            dot={false}
            activeDot={{
              r: 4,
              fill: "var(--acc, #ff6a00)",
              stroke: "var(--bg-000, #0a0a0a)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default Tr100IndexChart;
