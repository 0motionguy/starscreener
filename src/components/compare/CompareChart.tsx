"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface CompareChartProps {
  repos: Repo[];
}

const LINE_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];

const MIN_HISTORY_DAYS = 7;

function nonZeroDays(series: number[]): number {
  return series.filter((n) => Number.isFinite(n) && n !== 0).length;
}

function isFlat(series: number[]): boolean {
  // All values identical → no real history, just today's value carried back
  // across every slot. Treat the same as "no history yet".
  return series.length > 0 && new Set(series).size <= 1;
}

function hasHistory(series: number[]): boolean {
  return nonZeroDays(series) >= MIN_HISTORY_DAYS && !isFlat(series);
}

/**
 * Build chart data: merge each repo's sparklineData into a unified array of
 * { day, repoId1: value, repoId2: value, ... } rows.
 */
function buildChartData(repos: Repo[]) {
  const length = repos[0]?.sparklineData.length ?? 30;
  const data: Record<string, string | number>[] = [];

  for (let i = 0; i < length; i++) {
    const point: Record<string, string | number> = {
      day: `Day ${i + 1}`,
    };
    for (const repo of repos) {
      point[repo.id] = repo.sparklineData[i] ?? 0;
    }
    data.push(point);
  }

  return data;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    color: string;
    name: string;
  }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="v2-card px-3 py-2 shadow-card">
      <p className="text-xs text-text-tertiary font-mono mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-text-secondary truncate max-w-[120px]">
            {entry.name}
          </span>
          <span className="font-mono font-bold text-text-primary ml-auto">
            {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CompareChart({ repos }: CompareChartProps) {
  if (repos.length < 2) return null;

  // Detect sparse histories so we can surface a "still collecting" banner
  // instead of letting Recharts draw near-empty or dead-flat lines for
  // newly-tracked repos.
  const sparseRepos = repos.filter((r) => !hasHistory(r.sparklineData));
  const allSparse = sparseRepos.length === repos.length;

  const data = buildChartData(repos);

  return (
    <div className="v2-card p-4 animate-fade-in">
      <h3 className="text-sm font-medium text-text-secondary mb-3">
        Star Activity (30 days)
      </h3>

      {sparseRepos.length > 0 && (
        <div
          className="mb-3 rounded-card border border-border-primary bg-bg-secondary px-3 py-2 text-xs text-text-tertiary"
          role="status"
        >
          <span className="font-medium text-text-secondary">
            Collecting history —{" "}
          </span>
          {sparseRepos
            .map((r) => {
              const days = nonZeroDays(r.sparklineData);
              return `${r.fullName} (${days}/30 days)`;
            })
            .join(", ")}
        </div>
      )}

      {allSparse && <CompareChartPlaceholder />}

      {/* Desktop height */}
      {!allSparse && (
      <div className="hidden sm:block h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--v3-line-200)"
              opacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{
                fontSize: 10,
                fill: "var(--v3-ink-400)",
                fontFamily: "var(--font-geist-mono), monospace",
                letterSpacing: "0.12em",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--v3-line-200)" }}
              interval={4}
            />
            <YAxis
              tick={{
                fontSize: 10,
                fill: "var(--v3-ink-400)",
                fontFamily: "var(--font-geist-mono), monospace",
                letterSpacing: "0.12em",
              }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNumber(v)}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-text-secondary">{value}</span>
              )}
            />
            {repos.map((repo, i) => (
              <Line
                key={repo.id}
                type="monotone"
                dataKey={repo.id}
                name={repo.fullName}
                stroke={LINE_COLORS[i]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Mobile height */}
      {!allSparse && (
      <div className="block sm:hidden h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--v3-line-200)"
              opacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{
                fontSize: 9,
                fill: "var(--v3-ink-400)",
                fontFamily: "var(--font-geist-mono), monospace",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--v3-line-200)" }}
              interval={9}
            />
            <YAxis
              tick={{
                fontSize: 9,
                fill: "var(--v3-ink-400)",
                fontFamily: "var(--font-geist-mono), monospace",
              }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNumber(v)}
              width={36}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="circle"
              iconSize={6}
              formatter={(value: string) => (
                <span className="text-[10px] text-text-secondary">{value}</span>
              )}
            />
            {repos.map((repo, i) => (
              <Line
                key={repo.id}
                type="monotone"
                dataKey={repo.id}
                name={repo.fullName}
                stroke={LINE_COLORS[i]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}

/**
 * Rendered when every selected repo has fewer than MIN_HISTORY_DAYS
 * non-zero sparkline samples — a full chart would be misleading, so
 * we show a thin dotted baseline instead.
 */
function CompareChartPlaceholder() {
  return (
    <div className="h-[240px] sm:h-[300px] w-full relative flex items-center justify-center">
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 400 240"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <line
          x1={16}
          x2={384}
          y1={120}
          y2={120}
          stroke="var(--color-text-muted, var(--color-text-tertiary))"
          strokeWidth={1}
          strokeDasharray="4 6"
          strokeLinecap="round"
          opacity={0.5}
        />
      </svg>
      <p
        className="relative text-[11px] font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-[2px]"
        style={{
          background: "var(--v3-bg-050)",
          border: "1px solid var(--v3-line-200)",
          color: "var(--v3-ink-300)",
        }}
      >
        {"// COLLECTING HISTORY · CHECK BACK AFTER MORE DAILY SNAPSHOTS"}
      </p>
    </div>
  );
}
