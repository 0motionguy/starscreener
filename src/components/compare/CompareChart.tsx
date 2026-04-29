"use client";

import { useState } from "react";
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
import {
  filterPayloadByWindow,
  type StarActivityMode,
  type StarActivityPayload,
  type StarActivityScale,
  type StarActivityWindow,
} from "@/lib/star-activity";
import { formatNumber } from "@/lib/utils";
import { COMPARE_PALETTE } from "./palette";

interface CompareChartProps {
  repos: Repo[];
  /**
   * Per-repo full-history payloads keyed by lowercased fullName. When present,
   * the chart plots the full series; when absent, it falls back to each
   * repo's bundled 30-day sparklineData (legacy behaviour).
   */
  payloads?: Record<string, StarActivityPayload>;
  /** Controlled mode. Defaults to internal state, default "date". */
  mode?: StarActivityMode;
  /** Controlled scale. Defaults to internal state, default "lin". */
  scale?: StarActivityScale;
  /** Controlled window. Defaults to internal state, default "all". */
  window?: StarActivityWindow;
  onModeChange?: (mode: StarActivityMode) => void;
  onScaleChange?: (scale: StarActivityScale) => void;
  onWindowChange?: (window: StarActivityWindow) => void;
}

const MIN_HISTORY_DAYS = 7;

function nonZeroDays(series: number[]): number {
  return series.filter((n) => Number.isFinite(n) && n !== 0).length;
}

function isFlat(series: number[]): boolean {
  return series.length > 0 && new Set(series).size <= 1;
}

function hasHistory(series: number[]): boolean {
  return nonZeroDays(series) >= MIN_HISTORY_DAYS && !isFlat(series);
}

interface SeriesPoint {
  x: number;
  y: number;
  stars: number;
}

interface RepoSeries {
  repoId: string;
  fullName: string;
  data: SeriesPoint[];
  /** True if drawn from a full StarActivityPayload (vs. legacy sparklineData). */
  fromPayload: boolean;
}

function lookupPayload(
  payloads: Record<string, StarActivityPayload> | undefined,
  fullName: string,
): StarActivityPayload | null {
  if (!payloads) return null;
  return payloads[fullName.toLowerCase()] ?? null;
}

function logFloor(value: number, scale: StarActivityScale): number {
  // Recharts' log scale fails on 0/negative — clamp to 1 only when in log mode.
  return scale === "log" ? Math.max(1, value) : value;
}

function buildSeriesForRepo(
  repo: Repo,
  payloads: Record<string, StarActivityPayload> | undefined,
  mode: StarActivityMode,
  scale: StarActivityScale,
  window: StarActivityWindow,
): RepoSeries {
  const rawPayload = lookupPayload(payloads, repo.fullName);
  const payload = rawPayload
    ? filterPayloadByWindow(rawPayload, window)
    : null;

  if (payload && payload.points.length > 0) {
    const data = payload.points.map((pt, i) => ({
      x:
        mode === "timeline"
          ? i
          : Date.parse(`${pt.d}T00:00:00Z`),
      y: logFloor(pt.s, scale),
      stars: pt.s,
    }));
    return { repoId: repo.id, fullName: repo.fullName, data, fromPayload: true };
  }

  // Legacy fallback — convert the 30-element sparkline into per-day points.
  const sparkline = repo.sparklineData ?? [];
  const len = sparkline.length;
  const todayMs = Date.now();
  const data = sparkline.map((s, i) => {
    const daysAgo = len - 1 - i;
    return {
      x: mode === "timeline" ? i : todayMs - daysAgo * 86_400_000,
      y: logFloor(s, scale),
      stars: s,
    };
  });
  return { repoId: repo.id, fullName: repo.fullName, data, fromPayload: false };
}

function formatDateTick(epochMs: number): string {
  const d = new Date(epochMs);
  // Sparse YYYY-MM ticks — chart period is usually months/years.
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatTimelineTick(daysSinceStart: number): string {
  if (daysSinceStart < 30) return `d${Math.round(daysSinceStart)}`;
  if (daysSinceStart < 365) return `${Math.round(daysSinceStart / 30)}mo`;
  return `${(daysSinceStart / 365).toFixed(1)}y`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    color: string;
    name: string;
    payload?: SeriesPoint;
  }>;
  label?: number;
  mode: StarActivityMode;
}

function ChartTooltip({ active, payload, label, mode }: CustomTooltipProps) {
  if (!active || !payload?.length || label === undefined) return null;

  const heading =
    mode === "timeline"
      ? formatTimelineTick(label)
      : new Date(label).toISOString().slice(0, 10);

  return (
    <div className="v2-card px-3 py-2 shadow-card">
      <p className="text-xs text-text-tertiary font-mono mb-1.5">{heading}</p>
      {payload.map((entry) => {
        // Prefer the original star count from the data point payload over the
        // y value (which may be log-transformed when scale=log).
        const stars = entry.payload?.stars ?? entry.value;
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-text-secondary truncate max-w-[120px]">
              {entry.name}
            </span>
            <span className="font-mono font-bold text-text-primary ml-auto">
              {formatNumber(stars)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToggleButton({ active, onClick, children }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em] transition-colors ${
        active
          ? "bg-bg-tertiary text-text-primary"
          : "bg-bg-secondary text-text-tertiary hover:text-text-secondary"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

interface ToggleGroupProps<T extends string> {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (next: T) => void;
}

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: ToggleGroupProps<T>) {
  return (
    <div className="inline-flex gap-px rounded-[3px] border border-border-primary overflow-hidden">
      {options.map((opt) => (
        <ToggleButton
          key={opt.value}
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </ToggleButton>
      ))}
    </div>
  );
}

export function CompareChart({
  repos,
  payloads,
  mode: modeProp,
  scale: scaleProp,
  window: windowProp,
  onModeChange,
  onScaleChange,
  onWindowChange,
}: CompareChartProps) {
  // Controlled-or-uncontrolled — caller can either drive mode/scale/window
  // from URL state or let the chart own it.
  const [internalMode, setInternalMode] = useState<StarActivityMode>("date");
  const [internalScale, setInternalScale] = useState<StarActivityScale>("lin");
  const [internalWindow, setInternalWindow] =
    useState<StarActivityWindow>("all");
  const mode = modeProp ?? internalMode;
  const scale = scaleProp ?? internalScale;
  const window = windowProp ?? internalWindow;

  const setMode = (m: StarActivityMode) => {
    onModeChange?.(m);
    if (modeProp === undefined) setInternalMode(m);
  };
  const setScale = (s: StarActivityScale) => {
    onScaleChange?.(s);
    if (scaleProp === undefined) setInternalScale(s);
  };
  const setWindow = (w: StarActivityWindow) => {
    onWindowChange?.(w);
    if (windowProp === undefined) setInternalWindow(w);
  };

  // Single-repo callers (e.g. /repo/[owner]/[name]/star-activity) render the
  // same chart with one series; the prior `repos.length < 2` guard belonged
  // to /compare's empty-state UX which is now handled by CompareClient itself.
  if (repos.length === 0) return null;

  const series = repos.map((r) =>
    buildSeriesForRepo(r, payloads, mode, scale, window),
  );
  const anyFromPayload = series.some((s) => s.fromPayload);

  // Sparseness check — only meaningful for the legacy sparkline path.
  // Repos with payloads always have something useful to draw, even if short.
  const sparseRepos = repos.filter(
    (r, i) => !series[i].fromPayload && !hasHistory(r.sparklineData),
  );
  const allSparse = sparseRepos.length === repos.length;

  const xAxisProps = {
    type: "number" as const,
    dataKey: "x",
    domain: ["dataMin", "dataMax"] as ["dataMin", "dataMax"],
    tickFormatter:
      mode === "timeline"
        ? (v: number) => formatTimelineTick(v)
        : (v: number) => formatDateTick(v),
    tickLine: false,
    axisLine: { stroke: "var(--v3-line-200)" },
  };

  const yAxisProps = {
    tick: {
      fontSize: 10,
      fill: "var(--v3-ink-400)",
      fontFamily: "var(--font-geist-mono), monospace",
      letterSpacing: "0.12em",
    },
    tickLine: false,
    axisLine: false,
    tickFormatter: (v: number) => formatNumber(v),
    width: 56,
    scale: scale === "log" ? ("log" as const) : ("auto" as const),
    // Recharts requires an explicit numeric domain for log scales.
    domain:
      scale === "log"
        ? ([1, "dataMax"] as [number, "dataMax"])
        : (["auto", "auto"] as ["auto", "auto"]),
    allowDataOverflow: scale === "log",
  };

  const title = anyFromPayload ? "Star Activity" : "Star Activity (30 days)";

  return (
    <div className="v2-card p-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup<StarActivityWindow>
            value={window}
            options={[
              { label: "7D", value: "7d" },
              { label: "30D", value: "30d" },
              { label: "90D", value: "90d" },
              { label: "6M", value: "6m" },
              { label: "1Y", value: "1y" },
              { label: "ALL", value: "all" },
            ]}
            onChange={setWindow}
          />
          <ToggleGroup<StarActivityMode>
            value={mode}
            options={[
              { label: "Date", value: "date" },
              { label: "Timeline", value: "timeline" },
            ]}
            onChange={setMode}
          />
          <ToggleGroup<StarActivityScale>
            value={scale}
            options={[
              { label: "Lin", value: "lin" },
              { label: "Log", value: "log" },
            ]}
            onChange={setScale}
          />
        </div>
      </div>

      {sparseRepos.length > 0 && !anyFromPayload && (
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

      {!allSparse && (
        <div className="hidden sm:block h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--v3-line-200)"
                opacity={0.35}
                vertical={false}
              />
              <XAxis
                {...xAxisProps}
                tick={{
                  fontSize: 10,
                  fill: "var(--v3-ink-400)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  letterSpacing: "0.12em",
                }}
              />
              <YAxis {...yAxisProps} />
              <Tooltip content={<ChartTooltip mode={mode} />} />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-text-secondary">{value}</span>
                )}
              />
              {series.map((s, i) => (
                <Line
                  key={s.repoId}
                  data={s.data}
                  type="monotone"
                  dataKey="y"
                  name={s.fullName}
                  stroke={COMPARE_PALETTE[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!allSparse && (
        <div className="block sm:hidden h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--v3-line-200)"
                opacity={0.35}
                vertical={false}
              />
              <XAxis
                {...xAxisProps}
                tick={{
                  fontSize: 9,
                  fill: "var(--v3-ink-400)",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
              />
              <YAxis
                {...yAxisProps}
                tick={{
                  fontSize: 9,
                  fill: "var(--v3-ink-400)",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
                width={44}
              />
              <Tooltip content={<ChartTooltip mode={mode} />} />
              <Legend
                verticalAlign="top"
                height={24}
                iconType="circle"
                iconSize={6}
                formatter={(value: string) => (
                  <span className="text-[10px] text-text-secondary">{value}</span>
                )}
              />
              {series.map((s, i) => (
                <Line
                  key={s.repoId}
                  data={s.data}
                  type="monotone"
                  dataKey="y"
                  name={s.fullName}
                  stroke={COMPARE_PALETTE[i]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
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
