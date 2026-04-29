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
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { Repo } from "@/lib/types";
import {
  computeMindshareSeries,
  computeVelocitySeries,
  filterPayloadByWindow,
  type StarActivityMetric,
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
  /** Controlled metric. Defaults to internal state, default "stars". */
  metric?: StarActivityMetric;
  onModeChange?: (mode: StarActivityMode) => void;
  onScaleChange?: (scale: StarActivityScale) => void;
  onWindowChange?: (window: StarActivityWindow) => void;
  onMetricChange?: (metric: StarActivityMetric) => void;
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
  /** Plotted Y value — log-floored when scale === "log", else === display. */
  y: number;
  /** Metric-natural value (stars / velocity / mindshare%) — for end-of-line
   *  labels and tooltips, regardless of log transform. */
  display: number;
  /** Raw cumulative star count, preserved across all metric modes. */
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

/**
 * Build per-repo series across all metric modes. STARS / VELOCITY are
 * computed per-repo from the repo's own payload; MINDSHARE depends on
 * the OTHER selected repos so the function loops once over the full set
 * before composing each repo's series.
 *
 * Returns one RepoSeries per input repo, in the same order as `repos`.
 * Repos with no payload AND no sparklineData get an empty series so the
 * upstream sparseness check still finds them.
 */
function buildAllSeries(
  repos: Repo[],
  payloads: Record<string, StarActivityPayload> | undefined,
  mode: StarActivityMode,
  scale: StarActivityScale,
  window: StarActivityWindow,
  metric: StarActivityMetric,
): RepoSeries[] {
  // Pre-filter every repo's payload by the chosen window once.
  const filtered = repos.map((r) => {
    const raw = lookupPayload(payloads, r.fullName);
    return raw ? filterPayloadByWindow(raw, window) : null;
  });

  // For MINDSHARE we need the union of sibling payloads to compute the
  // share denominator. Build that once.
  const siblingPayloads = filtered.filter(
    (p): p is StarActivityPayload => p !== null && p.points.length > 0,
  );

  return repos.map((repo, idx) => {
    const payload = filtered[idx];

    if (payload && payload.points.length > 0) {
      let yByPoint: number[];
      if (metric === "velocity") {
        yByPoint = computeVelocitySeries(payload);
      } else if (metric === "mindshare") {
        const shareByDay = computeMindshareSeries(payload, siblingPayloads);
        yByPoint = payload.points.map((p) => shareByDay.get(p.d) ?? 0);
      } else {
        yByPoint = payload.points.map((p) => p.s);
      }
      const data = payload.points.map((pt, i) => ({
        x:
          mode === "timeline"
            ? i
            : Date.parse(`${pt.d}T00:00:00Z`),
        y: logFloor(yByPoint[i], scale),
        display: yByPoint[i],
        stars: pt.s,
      }));
      return {
        repoId: repo.id,
        fullName: repo.fullName,
        data,
        fromPayload: true,
      };
    }

    // Legacy fallback — only meaningful for STARS metric. VELOCITY and
    // MINDSHARE both require the full payload; without it we render an
    // empty series and let the sparseness banner surface the issue.
    if (metric !== "stars") {
      return {
        repoId: repo.id,
        fullName: repo.fullName,
        data: [],
        fromPayload: false,
      };
    }
    const sparkline = repo.sparklineData ?? [];
    const len = sparkline.length;
    const todayMs = Date.now();
    const data = sparkline.map((s, i) => {
      const daysAgo = len - 1 - i;
      return {
        x: mode === "timeline" ? i : todayMs - daysAgo * 86_400_000,
        y: logFloor(s, scale),
        display: s,
        stars: s,
      };
    });
    return {
      repoId: repo.id,
      fullName: repo.fullName,
      data,
      fromPayload: false,
    };
  });
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

function formatEndLabelValue(
  display: number,
  metric: StarActivityMetric,
): string {
  if (metric === "velocity") {
    const sign = display >= 0 ? "+" : "";
    return `${sign}${formatNumber(Math.round(display))}/d`;
  }
  if (metric === "mindshare") return `${display.toFixed(0)}%`;
  return formatNumber(display);
}

interface EndLabelProps {
  shortName: string;
  color: string;
  metric: StarActivityMetric;
  lastIndex: number;
  /** Compact = mobile breakpoint, smaller font + only the value (no name). */
  compact?: boolean;
}

/**
 * Recharts LabelList content renderer that draws each series' label off
 * the right edge of the chart, but ONLY at the last data point. The line
 * colour carries through so the reader can map label → series without
 * scanning the legend.
 */
function makeEndLabel({
  shortName,
  color,
  metric,
  lastIndex,
  compact = false,
}: EndLabelProps) {
  return function EndOfLineLabel(rawProps: unknown) {
    const props = rawProps as {
      x?: number;
      y?: number;
      index?: number;
      value?: number;
      payload?: SeriesPoint;
    };
    if (props.index !== lastIndex) return null;
    if (typeof props.x !== "number" || typeof props.y !== "number") return null;
    const display = props.payload?.display ?? props.value ?? 0;
    const valueText = formatEndLabelValue(display, metric);
    const nameSize = compact ? 10 : 11;
    const valueSize = compact ? 9 : 10;
    return (
      <g>
        {!compact && (
          <text
            x={props.x + 6}
            y={props.y - 6}
            fill={color}
            fontSize={nameSize}
            fontFamily="var(--font-geist-mono), monospace"
            fontWeight={600}
            textAnchor="start"
            dominantBaseline="middle"
          >
            {shortName}
          </text>
        )}
        <text
          x={props.x + 6}
          y={props.y + (compact ? 0 : 8)}
          fill={color}
          opacity={0.75}
          fontSize={valueSize}
          fontFamily="var(--font-geist-mono), monospace"
          textAnchor="start"
          dominantBaseline="middle"
        >
          {valueText}
        </text>
      </g>
    );
  };
}

function shortNameOf(fullName: string): string {
  const parts = fullName.split("/");
  return parts[1] ?? fullName;
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
  metric: metricProp,
  onModeChange,
  onScaleChange,
  onWindowChange,
  onMetricChange,
}: CompareChartProps) {
  // Controlled-or-uncontrolled — caller can either drive mode/scale/window/metric
  // from URL state or let the chart own it.
  const [internalMode, setInternalMode] = useState<StarActivityMode>("date");
  const [internalScale, setInternalScale] = useState<StarActivityScale>("lin");
  const [internalWindow, setInternalWindow] =
    useState<StarActivityWindow>("all");
  const [internalMetric, setInternalMetric] =
    useState<StarActivityMetric>("stars");
  const mode = modeProp ?? internalMode;
  const scale = scaleProp ?? internalScale;
  const window = windowProp ?? internalWindow;
  const metric = metricProp ?? internalMetric;

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
  const setMetric = (m: StarActivityMetric) => {
    onMetricChange?.(m);
    if (metricProp === undefined) setInternalMetric(m);
  };

  // Single-repo callers (e.g. /repo/[owner]/[name]/star-activity) render the
  // same chart with one series; the prior `repos.length < 2` guard belonged
  // to /compare's empty-state UX which is now handled by CompareClient itself.
  if (repos.length === 0) return null;

  const series = buildAllSeries(repos, payloads, mode, scale, window, metric);
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

  // Y-axis tick formatter swaps per metric — STARS shows compacted counts,
  // VELOCITY shows "+N/d" and MINDSHARE shows "N%" so the reader doesn't
  // confuse a 4.2% mindshare with 4 stars.
  const yTickFormatter = (v: number) => {
    if (metric === "velocity") {
      const sign = v >= 0 ? "+" : "";
      return `${sign}${formatNumber(Math.round(v))}/d`;
    }
    if (metric === "mindshare") {
      return `${v.toFixed(0)}%`;
    }
    return formatNumber(v);
  };

  // MINDSHARE is a percentage 0..100 — log scale doesn't make sense and
  // would distort the read. Force-disable for that metric.
  const effectiveScale: StarActivityScale =
    metric === "mindshare" ? "lin" : scale;

  const yAxisProps = {
    tick: {
      fontSize: 10,
      fill: "var(--v3-ink-400)",
      fontFamily: "var(--font-geist-mono), monospace",
      letterSpacing: "0.12em",
    },
    tickLine: false,
    axisLine: false,
    tickFormatter: yTickFormatter,
    width: 64,
    scale:
      effectiveScale === "log" ? ("log" as const) : ("auto" as const),
    // Recharts requires an explicit numeric domain for log scales.
    domain:
      effectiveScale === "log"
        ? ([1, "dataMax"] as [number, "dataMax"])
        : (["auto", "auto"] as ["auto", "auto"]),
    allowDataOverflow: effectiveScale === "log",
  };

  const title = anyFromPayload ? "Star Activity" : "Star Activity (30 days)";

  return (
    <div className="v2-card p-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup<StarActivityMetric>
            value={metric}
            options={[
              { label: "Stars", value: "stars" },
              { label: "Velocity", value: "velocity" },
              { label: "Mindshare", value: "mindshare" },
            ]}
            onChange={setMetric}
          />
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
                >
                  {s.data.length > 0 && (
                    <LabelList
                      dataKey="y"
                      content={makeEndLabel({
                        shortName: shortNameOf(s.fullName),
                        color: COMPARE_PALETTE[i],
                        metric,
                        lastIndex: s.data.length - 1,
                      })}
                    />
                  )}
                </Line>
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
                >
                  {s.data.length > 0 && (
                    <LabelList
                      dataKey="y"
                      content={makeEndLabel({
                        shortName: shortNameOf(s.fullName),
                        color: COMPARE_PALETTE[i],
                        metric,
                        lastIndex: s.data.length - 1,
                        compact: true,
                      })}
                    />
                  )}
                </Line>
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
