"use client";

// Compare-page multi-series line chart — migrated from Recharts ComposedChart
// to the shared Apache ECharts wrapper. Theme-aware (5 visual treatments) and
// metric-aware (stars / velocity / mindshare). Renders one ECharts canvas at
// each breakpoint so we can keep the desktop / mobile layout differences
// (label sizes, grid margins, glow strokes) without smashing them together.

import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { Repo } from "@/lib/types";
import { ChartShell } from "@/components/ui/ChartShell";
import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";
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
import {
  CHART_THEME_OPTIONS,
  getThemeConfig,
  type ChartTheme,
  type ThemeConfig,
} from "./themes";

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
  /** Controlled theme. Defaults to internal state, default "terminal". */
  theme?: ChartTheme;
  onModeChange?: (mode: StarActivityMode) => void;
  onScaleChange?: (scale: StarActivityScale) => void;
  onWindowChange?: (window: StarActivityWindow) => void;
  onMetricChange?: (metric: StarActivityMetric) => void;
  onThemeChange?: (theme: ChartTheme) => void;
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
  // ECharts log axis fails on 0/negative — clamp to 1 only when in log mode.
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

function shortNameOf(fullName: string): string {
  const parts = fullName.split("/");
  return parts[1] ?? fullName;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface BuildOptionInput {
  series: RepoSeries[];
  palette: readonly string[];
  themeConfig: ThemeConfig;
  metric: StarActivityMetric;
  mode: StarActivityMode;
  effectiveScale: StarActivityScale;
  compact: boolean;
}

/**
 * Build a single ECharts option from the selected series + theme. Compact
 * mode = mobile breakpoint: smaller fonts, narrower y-axis, drop the series
 * name from the end-of-line label.
 */
function buildOption({
  series,
  palette,
  themeConfig,
  metric,
  mode,
  effectiveScale,
  compact,
}: BuildOptionInput): EChartsCoreOption {
  const axisFontSize = compact ? 9 : themeConfig.light ? 12 : 10;
  const axisColor = themeConfig.axisColor;
  const axisFontWeight = themeConfig.light ? 600 : 400;

  const yTickFormatter = (v: number) => {
    if (metric === "velocity") {
      const sign = v >= 0 ? "+" : "";
      return `${sign}${formatNumber(Math.round(v))}/d`;
    }
    if (metric === "mindshare") return `${v.toFixed(0)}%`;
    return formatNumber(v);
  };

  const xAxis = {
    type: "value" as const,
    axisLine: { show: false, lineStyle: { color: "var(--v3-line-200)" } },
    axisTick: { show: false },
    axisLabel: {
      color: axisColor,
      fontSize: axisFontSize,
      fontFamily: "var(--font-geist-mono), monospace",
      fontWeight: axisFontWeight,
      // ECharts auto-spaces value-axis ticks; we just format the value.
      formatter: (value: number) =>
        mode === "timeline"
          ? formatTimelineTick(value)
          : formatDateTick(value),
      hideOverlap: true,
    },
    splitLine: { show: false },
    scale: true,
  };

  const splitLineColor = themeConfig.light ? "#1f1f1f" : "var(--v3-line-200)";
  const splitLineOpacity = themeConfig.light ? 0.15 : 0.35;

  const yAxis = {
    type: effectiveScale === "log" ? ("log" as const) : ("value" as const),
    // logBase only used when type === "log" — ECharts ignores it otherwise.
    logBase: 10,
    min: effectiveScale === "log" ? 1 : undefined,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: axisColor,
      fontSize: axisFontSize,
      fontFamily: "var(--font-geist-mono), monospace",
      fontWeight: axisFontWeight,
      formatter: yTickFormatter,
    },
    splitLine:
      themeConfig.gridDensity === "none"
        ? { show: false }
        : {
            show: true,
            lineStyle: {
              color: splitLineColor,
              type: "dashed" as const,
              opacity: splitLineOpacity,
            },
          },
  };

  // End-of-line labels: ECharts can place a label on the last point via a
  // data-level `label` override. We only set it on the final point so the
  // line stays clean.
  const buildLineData = (s: RepoSeries) => {
    const lastIdx = s.data.length - 1;
    return s.data.map((pt, i) => {
      const base = {
        value: [pt.x, pt.y] as [number, number],
        // Keep raw display + stars on the data point so the tooltip can
        // surface the unmodified number even when log-scaled.
        display: pt.display,
        stars: pt.stars,
      };
      if (i !== lastIdx) return base;
      const labelText = compact
        ? formatEndLabelValue(pt.display, metric)
        : `${shortNameOf(s.fullName)}\n${formatEndLabelValue(pt.display, metric)}`;
      return {
        ...base,
        label: {
          show: true,
          position: "right" as const,
          formatter: labelText,
          color: paletteColor(palette, s),
          fontSize: compact ? 9 : 10,
          fontFamily: "var(--font-geist-mono), monospace",
          lineHeight: compact ? 11 : 13,
          align: "left" as const,
        },
      };
    });
  };

  // Area fills — render BEFORE the lines via z so the stroke sits on top.
  const areaSeries = themeConfig.areaFill
    ? series.map((s, i) => ({
        type: "line" as const,
        name: `${s.fullName} area`,
        showSymbol: false,
        data: s.data.map((pt) => [pt.x, pt.y] as [number, number]),
        lineStyle: { width: 0, color: "transparent" },
        areaStyle: {
          color: palette[i],
          opacity: themeConfig.areaFillOpacity,
        },
        z: 1,
        silent: true,
        animationDuration: 0,
      }))
    : [];

  // Outer-glow stroke pass (neon / crt themes).
  const glowWidth = compact
    ? Math.max(2, themeConfig.outerGlowWidth - 2)
    : themeConfig.outerGlowWidth;
  const glowSeries = themeConfig.outerGlow
    ? series.map((s, i) => ({
        type: "line" as const,
        name: `${s.fullName} glow`,
        showSymbol: false,
        data: s.data.map((pt) => [pt.x, pt.y] as [number, number]),
        lineStyle: {
          width: glowWidth,
          color: palette[i],
          opacity: themeConfig.outerGlowOpacity,
        },
        z: 2,
        silent: true,
        animationDuration: 0,
      }))
    : [];

  const strokeWidth = compact
    ? Math.max(1, themeConfig.strokeWidth - 0.5)
    : themeConfig.strokeWidth;

  const lineSeries = series.map((s, i) => ({
    type: "line" as const,
    name: s.fullName,
    showSymbol: false,
    data: buildLineData(s),
    lineStyle: { width: strokeWidth, color: palette[i] },
    itemStyle: { color: palette[i] },
    emphasis: {
      itemStyle: {
        color: palette[i],
        borderColor: CHART_TOKENS.bgRaised,
        borderWidth: 0,
      },
    },
    z: 5,
    animationDuration: 0,
  }));

  return {
    grid: compact
      ? { top: 28, right: 56, bottom: 28, left: 44, containLabel: false }
      : { top: 28, right: 80, bottom: 32, left: 64, containLabel: false },
    legend: {
      show: true,
      top: 0,
      left: "left" as const,
      itemWidth: compact ? 6 : 8,
      itemHeight: compact ? 6 : 8,
      icon: "circle" as const,
      data: series.map((s) => s.fullName),
      textStyle: {
        color: themeConfig.light ? "#1f1f1f" : CHART_TOKENS.textSubtle,
        fontSize: compact ? 10 : 12,
      },
    },
    xAxis,
    yAxis,
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: CHART_TOKENS.bgCanvas,
      borderColor: CHART_TOKENS.borderDefault,
      borderWidth: 1,
      textStyle: {
        color: CHART_TOKENS.textDefault,
        fontSize: 11,
        fontFamily: "var(--font-geist-mono), monospace",
      },
      extraCssText: "box-shadow: none;",
      axisPointer: {
        type: "line" as const,
        lineStyle: {
          color: CHART_TOKENS.borderDefault,
          type: "dashed" as const,
          width: 1,
        },
      },
      formatter: (params: unknown) => {
        const list = Array.isArray(params)
          ? (params as Array<TooltipParam>)
          : [params as TooltipParam];
        if (list.length === 0) return "";
        // Filter out the helper area / glow series so the tooltip shows
        // only the real lines.
        const real = list.filter((p) => {
          const seriesName = p.seriesName ?? "";
          return !seriesName.endsWith(" area") && !seriesName.endsWith(" glow");
        });
        if (real.length === 0) return "";
        const axisValue = real[0].axisValue;
        const heading =
          mode === "timeline"
            ? formatTimelineTick(axisValue)
            : new Date(axisValue).toISOString().slice(0, 10);
        const rows = real
          .map((p) => {
            const stars =
              p.data && typeof p.data === "object" && "stars" in p.data
                ? (p.data as { stars: number }).stars
                : (Array.isArray(p.data) ? p.data[1] : p.value) ?? 0;
            return `
              <div style="display:flex;align-items:center;gap:8px;font-size:12px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0;"></span>
                <span style="color:${CHART_TOKENS.textSubtle};max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.seriesName ?? "")}</span>
                <span style="margin-left:auto;color:${CHART_TOKENS.textDefault};font-weight:600;font-variant-numeric:tabular-nums;">${formatNumber(stars as number)}</span>
              </div>`;
          })
          .join("");
        return `
          <div style="min-width:180px;">
            <div style="font-size:11px;color:${CHART_TOKENS.textFaint};margin-bottom:6px;">${heading}</div>
            ${rows}
          </div>
        `;
      },
    },
    series: [...areaSeries, ...glowSeries, ...lineSeries],
  };
}

interface TooltipParam {
  seriesName?: string;
  color: string;
  axisValue: number;
  value?: number | unknown[];
  data?: unknown;
}

function paletteColor(
  palette: readonly string[],
  s: RepoSeries,
): string {
  // The palette index is decided by the caller (the .map above) — but we
  // need it again inside buildLineData. The series list is passed in the
  // same order, so we recover the index by reference equality.
  // (Calling code: series.forEach((s, i) => ... palette[i]).)
  // To stay simple we just look it up via a Map captured on first use.
  const idx = paletteIndexCache.get(s);
  if (idx === undefined) return palette[0];
  return palette[idx];
}

// Module-scoped cache: filled in `assignPaletteIndices` before option builds.
const paletteIndexCache = new WeakMap<RepoSeries, number>();

function assignPaletteIndices(series: RepoSeries[]) {
  series.forEach((s, i) => paletteIndexCache.set(s, i));
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
  theme: themeProp,
  onModeChange,
  onScaleChange,
  onWindowChange,
  onMetricChange,
  onThemeChange,
}: CompareChartProps) {
  // Controlled-or-uncontrolled — caller can either drive state from URL or
  // let the chart own it.
  const [internalMode, setInternalMode] = useState<StarActivityMode>("date");
  const [internalScale, setInternalScale] = useState<StarActivityScale>("lin");
  const [internalWindow, setInternalWindow] =
    useState<StarActivityWindow>("all");
  const [internalMetric, setInternalMetric] =
    useState<StarActivityMetric>("stars");
  const [internalTheme, setInternalTheme] = useState<ChartTheme>("terminal");
  const mode = modeProp ?? internalMode;
  const scale = scaleProp ?? internalScale;
  const window = windowProp ?? internalWindow;
  const metric = metricProp ?? internalMetric;
  const theme = themeProp ?? internalTheme;
  const themeConfig = getThemeConfig(theme);
  // Theme overrides the default 5-slot palette. Falls back to COMPARE_PALETTE
  // for any caller that legitimately doesn't pass a theme — keeping the old
  // surface look unchanged.
  const palette = themeConfig?.palette ?? COMPARE_PALETTE;

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
  const setTheme = (t: ChartTheme) => {
    onThemeChange?.(t);
    if (themeProp === undefined) setInternalTheme(t);
  };

  // MINDSHARE is a percentage 0..100 — log scale doesn't make sense and
  // would distort the read. Force-disable for that metric.
  const effectiveScale: StarActivityScale =
    metric === "mindshare" ? "lin" : scale;

  const series = useMemo(
    () => buildAllSeries(repos, payloads, mode, scale, window, metric),
    [repos, payloads, mode, scale, window, metric],
  );

  // Refresh palette-index cache whenever the series array identity changes,
  // so end-of-line labels grab the right colour.
  assignPaletteIndices(series);

  const anyFromPayload = series.some((s) => s.fromPayload);
  const sparseRepos = repos.filter(
    (r, i) => !series[i].fromPayload && !hasHistory(r.sparklineData),
  );
  const allSparse = sparseRepos.length === repos.length;

  const desktopOption = useMemo(
    () =>
      buildOption({
        series,
        palette,
        themeConfig,
        metric,
        mode,
        effectiveScale,
        compact: false,
      }),
    [series, palette, themeConfig, metric, mode, effectiveScale],
  );

  const compactOption = useMemo(
    () =>
      buildOption({
        series,
        palette,
        themeConfig,
        metric,
        mode,
        effectiveScale,
        compact: true,
      }),
    [series, palette, themeConfig, metric, mode, effectiveScale],
  );

  // Single-repo callers (e.g. /repo/[owner]/[name]/star-activity) render the
  // same chart with one series; the prior `repos.length < 2` guard belonged
  // to /compare's empty-state UX which is now handled by CompareClient itself.
  if (repos.length === 0) return null;

  const title = anyFromPayload ? "Star Activity" : "Star Activity (30 days)";

  return (
    <ChartShell
      as="div"
      variant="chart"
      className="p-4 animate-fade-in relative"
      style={{
        backgroundColor: themeConfig.cardBg,
        border: `1px solid ${themeConfig.cardBorder}`,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3
          className="text-sm font-medium"
          style={{
            color: themeConfig.light ? "#1f1f1f" : "var(--color-text-secondary)",
          }}
        >
          {title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup<ChartTheme>
            value={theme}
            options={[...CHART_THEME_OPTIONS]}
            onChange={setTheme}
          />
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
        <div className="chart-wrap hidden sm:block h-[300px] relative">
          {themeConfig.overlayPattern && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-card"
              style={{ backgroundImage: themeConfig.overlayPattern }}
            />
          )}
          <EChart
            option={desktopOption}
            height="100%"
            ariaLabel={`${title} (desktop)`}
          />
        </div>
      )}

      {!allSparse && (
        <div className="chart-wrap block sm:hidden h-[200px] relative">
          {themeConfig.overlayPattern && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-card"
              style={{ backgroundImage: themeConfig.overlayPattern }}
            />
          )}
          <EChart
            option={compactOption}
            height="100%"
            ariaLabel={`${title} (mobile)`}
          />
        </div>
      )}
    </ChartShell>
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
