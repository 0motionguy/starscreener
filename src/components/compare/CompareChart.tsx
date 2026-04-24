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
  Area,
  ReferenceLine,
} from "recharts";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { forecastLinear } from "@/lib/builder/predictions";

interface CompareChartProps {
  repos: Repo[];
  /** When true, render the 30d forecast band for each repo. Default true. */
  showForecast?: boolean;
}

const LINE_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
const FORECAST_DAYS = 30;

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

/**
 * Build the combined history + forecast chart data with band fields.
 *
 * For each repo we emit:
 *   - <repoId>         — actual value (history) or p50 (forecast)
 *   - <repoId>_p50     — forecast median (used for dotted line overlay)
 *   - <repoId>_band    — [low, high] tuple for Area range
 */
function buildChartDataWithForecast(repos: Repo[]) {
  const histLen = repos[0]?.sparklineData.length ?? 30;
  const data: Record<string, string | number | [number, number] | null>[] = [];

  // History section.
  for (let i = 0; i < histLen; i++) {
    const point: Record<string, string | number | [number, number] | null> = {
      day: `D-${histLen - 1 - i}`,
      isForecast: 0,
    };
    for (const repo of repos) {
      point[repo.id] = repo.sparklineData[i] ?? 0;
      point[`${repo.id}_p50`] = null;
      point[`${repo.id}_band`] = null;
    }
    data.push(point);
  }

  // Forecast section.
  const forecastsById = new Map(
    repos.map((r) => [r.id, forecastLinear(r.sparklineData, { horizon: FORECAST_DAYS, lookback: 30 })]),
  );
  for (let t = 1; t <= FORECAST_DAYS; t++) {
    const point: Record<string, string | number | [number, number] | null> = {
      day: `D+${t}`,
      isForecast: 1,
    };
    for (const repo of repos) {
      const f = forecastsById.get(repo.id);
      const fp = f?.points.find((p) => p.t === t);
      point[repo.id] = null; // don't extend the solid actual line
      point[`${repo.id}_p50`] = fp?.p50 ?? null;
      point[`${repo.id}_band`] =
        fp && fp.p20 != null && fp.p80 != null ? [fp.p20, fp.p80] : null;
    }
    data.push(point);
  }

  return { data, historyLastLabel: `D-0` };
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
    <div className="bg-bg-card border border-border-primary rounded-card px-3 py-2 shadow-card">
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

export function CompareChart({ repos, showForecast = true }: CompareChartProps) {
  if (repos.length < 2) return null;

  // Detect sparse histories so we can surface a "still collecting" banner
  // instead of letting Recharts draw near-empty or dead-flat lines for
  // newly-tracked repos.
  const sparseRepos = repos.filter((r) => !hasHistory(r.sparklineData));
  const allSparse = sparseRepos.length === repos.length;

  // Forecasting needs a non-sparse history. If every repo is sparse, fall
  // back to the history-only shape so we don't render a band of noise.
  const useForecast = showForecast && !allSparse;

  const withForecast = useForecast ? buildChartDataWithForecast(repos) : null;
  const data = withForecast ? withForecast.data : buildChartData(repos);
  const historyLastLabel = withForecast?.historyLastLabel ?? null;

  return (
    <div className="bg-bg-card rounded-card border border-border-primary p-4 shadow-card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-secondary">
          Star Activity (30d history
          {useForecast ? " + 30d forecast" : ""})
        </h3>
        {useForecast && (
          <span
            className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary"
            title="Forecast method: rolling OLS on last 30 non-zero daily values; band is ±0.84σ residual, widening with √t."
          >
            method · auto_linear_vol_30d
          </span>
        )}
      </div>

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
              stroke="var(--color-border-primary)"
              opacity={0.5}
            />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-primary)" }}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
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
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {useForecast && historyLastLabel && (
              <ReferenceLine
                x={historyLastLabel}
                stroke="var(--color-border-primary)"
                strokeDasharray="4 4"
                label={{
                  value: "today",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "var(--color-text-tertiary)",
                }}
              />
            )}
            {useForecast &&
              repos.map((repo, i) => (
                <Area
                  key={`${repo.id}_band`}
                  type="monotone"
                  dataKey={`${repo.id}_band`}
                  name={`${repo.fullName} · p20–p80`}
                  stroke="none"
                  fill={LINE_COLORS[i]}
                  fillOpacity={0.12}
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              ))}
            {useForecast &&
              repos.map((repo, i) => (
                <Line
                  key={`${repo.id}_p50`}
                  type="monotone"
                  dataKey={`${repo.id}_p50`}
                  name={`${repo.fullName} · p50`}
                  stroke={LINE_COLORS[i]}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
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
              stroke="var(--color-border-primary)"
              opacity={0.5}
            />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 9, fill: "var(--color-text-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-primary)" }}
              interval={9}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "var(--color-text-tertiary)" }}
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
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {useForecast && historyLastLabel && (
              <ReferenceLine
                x={historyLastLabel}
                stroke="var(--color-border-primary)"
                strokeDasharray="3 3"
              />
            )}
            {useForecast &&
              repos.map((repo, i) => (
                <Area
                  key={`${repo.id}_band`}
                  type="monotone"
                  dataKey={`${repo.id}_band`}
                  stroke="none"
                  fill={LINE_COLORS[i]}
                  fillOpacity={0.12}
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              ))}
            {useForecast &&
              repos.map((repo, i) => (
                <Line
                  key={`${repo.id}_p50`}
                  type="monotone"
                  dataKey={`${repo.id}_p50`}
                  stroke={LINE_COLORS[i]}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
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
      <p className="relative text-xs font-mono text-text-tertiary bg-bg-card px-2 py-1 rounded-badge">
        Collecting history — check back after more daily snapshots
      </p>
    </div>
  );
}
