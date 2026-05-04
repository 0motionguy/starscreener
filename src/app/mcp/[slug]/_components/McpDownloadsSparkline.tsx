"use client";

// Client-side sparkline for the per-MCP detail page. Recharts is a client
// dependency (uses ResizeObserver, refs, etc.) so this stays islanded —
// imported via `next/dynamic` from the server-rendered page.
//
// IMPORTANT: render only when the parent has real history points to pass.
// The parent is responsible for the placeholder when `points` is null —
// this component does NOT synthesize fake data.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { McpDownloadsHistoryPoint } from "@/lib/mcp-detail";

interface McpDownloadsSparklineProps {
  points: McpDownloadsHistoryPoint[];
}

export function McpDownloadsSparkline({ points }: McpDownloadsSparklineProps) {
  const data = useMemo(
    () => points.map((p) => ({ date: p.date, total: p.total })),
    [points],
  );
  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="mcp-dl-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(58, 214, 197, 0.55)" />
              <stop offset="100%" stopColor="rgba(58, 214, 197, 0.04)" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--v4-ink-400)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            tick={{ fill: "var(--v4-ink-400)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "var(--v4-bg-100)",
              border: "1px solid var(--v4-line-200)",
              borderRadius: 4,
              fontFamily: "var(--font-mono, ui-monospace)",
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--v4-ink-200)" }}
            itemStyle={{ color: "var(--v4-acc)" }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="rgba(58, 214, 197, 0.85)"
            strokeWidth={1.5}
            fill="url(#mcp-dl-gradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default McpDownloadsSparkline;
