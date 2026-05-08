"use client";

// Dual-series signal timeline for /repo/[owner]/[name]:
//   * stars growth (area, left Y-axis)
//   * daily mention volume stacked by source (bars, right Y-axis)
//   * optional per-mention dots for high-density days (compact overlay)
// Causality question ("did mentions spike BEFORE stars or AFTER?") becomes
// visible by putting both series on the same calendar x-axis.
//
// Migrated from Recharts ComposedChart to Apache ECharts (canvas-rendered)
// for perf headroom and a dual-axis API that doesn't fight us. The shared
// <EChart> wrapper handles SSR + theme + resize.

import { useCallback, useMemo, useState } from "react";
import type { EChartsCoreOption, ECharts } from "echarts/core";

import type { Repo, TimeRange } from "@/lib/types";
import { ChartShell } from "@/components/ui/ChartShell";
import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";
import { cn, formatNumber } from "@/lib/utils";
import {
  MENTION_PLATFORM_COLORS,
  MENTION_PLATFORM_LABELS,
  type MentionMarker,
  type MentionPlatform,
} from "./MentionMarkerMeta";

interface RepoDetailChartProps {
  repo: Repo;
  markers: MentionMarker[];
}

const TIME_TABS: { label: string; value: TimeRange; days: number }[] = [
  { label: "24h", value: "24h", days: 2 },
  { label: "7d", value: "7d", days: 7 },
  { label: "30d", value: "30d", days: 30 },
];

const DAY_MS = 86_400_000;

// Sources that contribute to the mention volume stack. Order is the stack
// order from bottom to top, and also the order used in the tooltip.
const SIGNAL_SOURCES: MentionPlatform[] = [
  "hn",
  "reddit",
  "bluesky",
  "twitter",
  "devto",
  "ph",
];

type SignalCounts = Record<MentionPlatform, number>;

interface SignalPoint {
  ts: number; // start-of-day UTC ms for that bucket
  stars: number;
  total: number; // sum of mentions that day
  counts: SignalCounts;
}

interface ScatterDot {
  ts: number;
  stars: number;
  marker: MentionMarker;
}

function emptyCounts(): SignalCounts {
  return {
    hn: 0,
    reddit: 0,
    bluesky: 0,
    twitter: 0,
    devto: 0,
    ph: 0,
  };
}

function startOfDayUtc(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function buildStarsPerDay(
  sparkline: number[],
  totalStars: number,
  days: number,
): number[] {
  const safe = (sparkline ?? []).filter((n) => Number.isFinite(n));
  const isCumulative = safe.every((v, i) => i === 0 || v >= safe[i - 1] - 1);
  const cumulative = isCumulative
    ? safe
    : safe.reduce<number[]>((acc, v, i) => {
        const prev = i === 0 ? 0 : acc[i - 1];
        acc.push(prev + v);
        return acc;
      }, []);

  const last = cumulative[cumulative.length - 1] || 1;
  const scale = totalStars > 0 ? totalStars / last : 1;
  const scaled = cumulative.map((v) => Math.round(v * scale));

  if (scaled.length >= days) return scaled.slice(scaled.length - days);
  const pad = new Array<number>(days - scaled.length).fill(
    scaled[0] ?? totalStars,
  );
  return [...pad, ...scaled];
}

/**
 * Roll per-mention markers up into a per-day stacked-count series and align
 * stars on the same UTC day buckets.
 */
function buildSignalSeries(
  sparkline: number[],
  totalStars: number,
  markers: MentionMarker[],
  days: number,
  nowMs: number,
): SignalPoint[] {
  const starsPerDay = buildStarsPerDay(sparkline, totalStars, days);
  const todayStart = startOfDayUtc(nowMs);

  const points: SignalPoint[] = [];
  for (let i = 0; i < days; i++) {
    const ts = todayStart - (days - 1 - i) * DAY_MS;
    points.push({
      ts,
      stars: starsPerDay[i] ?? totalStars,
      total: 0,
      counts: emptyCounts(),
    });
  }

  if (points.length === 0) return points;
  const firstTs = points[0].ts;
  const lastTs = points[points.length - 1].ts;

  for (const marker of markers) {
    if (!Number.isFinite(marker.xValue)) continue;
    const bucket = startOfDayUtc(marker.xValue);
    if (bucket < firstTs || bucket > lastTs) continue;
    const idx = Math.round((bucket - firstTs) / DAY_MS);
    const point = points[idx];
    if (!point) continue;
    point.counts[marker.platform] += 1;
    point.total += 1;
  }

  return points;
}

function starsAtBucket(series: SignalPoint[], ts: number): number | null {
  if (series.length === 0) return null;
  const bucket = startOfDayUtc(ts);
  const hit = series.find((p) => p.ts === bucket);
  if (hit) return hit.stars;
  if (bucket <= series[0].ts) return series[0].stars;
  return series[series.length - 1].stars;
}

function truncate(text: string, max = 80): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface AxisTooltipParam {
  seriesType: string;
  axisValue: number;
}

interface ItemTooltipParam {
  seriesType: string;
  data: { value: [number, number]; marker: MentionMarker };
}

type TooltipParam = AxisTooltipParam | ItemTooltipParam;

function renderSignalTooltipHtml(
  point: SignalPoint,
  starsDelta: number,
): string {
  const dateLabel = new Date(point.ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const deltaLabel =
    starsDelta === 0
      ? "±0"
      : starsDelta > 0
        ? `+${formatNumber(starsDelta)}`
        : `-${formatNumber(Math.abs(starsDelta))}`;
  const deltaColor =
    starsDelta > 0
      ? CHART_TOKENS.positive
      : starsDelta < 0
        ? CHART_TOKENS.negative
        : CHART_TOKENS.textFaint;

  const activeSources = SIGNAL_SOURCES.filter(
    (src) => point.counts[src] > 0,
  );
  const sourceRows = activeSources
    .map(
      (src) => `
      <li style="display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:10px;font-family:var(--font-mono),monospace;">
        <span style="display:inline-flex;align-items:center;gap:6px;color:${CHART_TOKENS.textSubtle};">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${MENTION_PLATFORM_COLORS[src]};${src === "devto" ? `border:1px solid #fff;` : ""}"></span>
          ${MENTION_PLATFORM_LABELS[src]}
        </span>
        <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${point.counts[src]}</span>
      </li>`,
    )
    .join("");

  return `
    <div style="min-width:200px;font-family:var(--font-mono),monospace;">
      <div style="font-size:11px;color:${CHART_TOKENS.textFaint};margin-bottom:6px;">${dateLabel}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:4px;">
        <span style="font-size:11px;color:${CHART_TOKENS.textSubtle};display:inline-flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${CHART_TOKENS.positive};"></span>
          Stars
        </span>
        <span style="font-size:12px;color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">
          ${formatNumber(point.stars)} <span style="font-size:10px;color:${deltaColor};">${deltaLabel}</span>
        </span>
      </div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid ${CHART_TOKENS.borderDefault};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:4px;">
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${CHART_TOKENS.textFaint};">Mentions</span>
          <span style="font-size:12px;color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${point.total}</span>
        </div>
        ${
          activeSources.length === 0
            ? `<div style="font-size:10px;color:${CHART_TOKENS.textFaint};font-style:italic;">no mentions this day</div>`
            : `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px;">${sourceRows}</ul>`
        }
      </div>
    </div>
  `;
}

function renderMarkerTooltipHtml(marker: MentionMarker): string {
  const date = new Date(marker.xValue).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `
    <div style="max-width:280px;font-family:var(--font-mono),monospace;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:4px;">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${marker.color};display:inline-flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${marker.color};${marker.stroke ? `border:1px solid ${marker.stroke};` : ""}"></span>
          ${escapeHtml(marker.platformLabel)}
        </span>
        <span style="font-size:10px;color:${CHART_TOKENS.textFaint};font-variant-numeric:tabular-nums;">${date}</span>
      </div>
      <p style="font-size:12px;color:${CHART_TOKENS.textDefault};line-height:1.35;margin:0 0 4px;">${escapeHtml(truncate(marker.title, 80))}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${CHART_TOKENS.textFaint};font-variant-numeric:tabular-nums;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${escapeHtml(marker.author)}</span>
        <span><span style="color:${CHART_TOKENS.textSubtle};">${formatNumber(marker.score)}</span> ${escapeHtml(marker.scoreLabel)}</span>
      </div>
    </div>
  `;
}

export function RepoDetailChart({
  repo,
  markers,
}: RepoDetailChartProps): React.ReactElement {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const periodDays = useMemo(
    () => TIME_TABS.find((tab) => tab.value === timeRange)?.days ?? 30,
    [timeRange],
  );
  const nowMs = useMemo(() => Date.now(), []);

  const signalSeries = useMemo(
    () =>
      buildSignalSeries(
        repo.sparklineData ?? [],
        repo.stars,
        markers,
        periodDays,
        nowMs,
      ),
    [repo.sparklineData, repo.stars, markers, periodDays, nowMs],
  );

  const xMin = signalSeries[0]?.ts ?? nowMs - periodDays * DAY_MS;
  const xMax = signalSeries[signalSeries.length - 1]?.ts ?? nowMs;

  const starsDeltaByTs = useMemo(() => {
    const out = new Map<number, number>();
    for (let i = 0; i < signalSeries.length; i++) {
      const point = signalSeries[i];
      const prev = i === 0 ? point.stars : signalSeries[i - 1].stars;
      out.set(point.ts, point.stars - prev);
    }
    return out;
  }, [signalSeries]);

  const visibleMarkers = useMemo(
    () =>
      markers.filter(
        (marker) => marker.xValue >= xMin && marker.xValue <= xMax + DAY_MS,
      ),
    [markers, xMin, xMax],
  );

  // Optional per-mention dot overlay: only render on days carrying ≥2 mentions.
  const densityOverlay = useMemo<ScatterDot[]>(() => {
    const highDensityBuckets = new Set<number>();
    for (const point of signalSeries) {
      if (point.total >= 2) highDensityBuckets.add(point.ts);
    }
    if (highDensityBuckets.size === 0) return [];
    const out: ScatterDot[] = [];
    for (const marker of visibleMarkers) {
      const bucket = startOfDayUtc(marker.xValue);
      if (!highDensityBuckets.has(bucket)) continue;
      const stars = starsAtBucket(signalSeries, marker.xValue) ?? repo.stars;
      out.push({ ts: marker.xValue, stars, marker });
    }
    return out;
  }, [signalSeries, visibleMarkers, repo.stars]);

  const seriesDelta =
    signalSeries.length > 1
      ? signalSeries[signalSeries.length - 1].stars - signalSeries[0].stars
      : repo.starsDelta7d;
  const positive = seriesDelta >= 0;
  const lineColor = positive ? CHART_TOKENS.positive : CHART_TOKENS.negative;
  const lineColorRgb = positive ? "34, 197, 94" : "255, 77, 77";

  const isSparse =
    signalSeries.length < 2 ||
    signalSeries.every((point) => point.stars === signalSeries[0].stars);

  const totalMentions = visibleMarkers.length;

  // Right Y-axis cap so bars live in roughly the bottom 30% of the canvas.
  const maxDailyMentions = Math.max(1, ...signalSeries.map((p) => p.total));
  const rightAxisMax = Math.max(4, Math.ceil(maxDailyMentions * 3.3));

  const legendPlatforms = useMemo(() => {
    const present = new Set<MentionPlatform>();
    for (const point of signalSeries) {
      for (const src of SIGNAL_SOURCES) {
        if (point.counts[src] > 0) present.add(src);
      }
    }
    return SIGNAL_SOURCES.filter((src) => present.has(src));
  }, [signalSeries]);

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (isSparse) return null;

    // Stars area series — `[ts, stars]` tuples on the time axis.
    const starsData = signalSeries.map(
      (p) => [p.ts, p.stars] as [number, number],
    );

    // One stacked-bar series per source. ECharts requires same-length arrays,
    // so we fill every bucket even if zero (will render as no bar).
    const stackSeries = SIGNAL_SOURCES.map((src, idx) => ({
      type: "bar" as const,
      yAxisIndex: 1,
      stack: "mentions",
      name: MENTION_PLATFORM_LABELS[src],
      barMaxWidth: 14,
      data: signalSeries.map((p) => [p.ts, p.counts[src]] as [number, number]),
      itemStyle: {
        color: MENTION_PLATFORM_COLORS[src],
        borderColor: src === "devto" ? "#ffffff" : undefined,
        borderWidth: src === "devto" ? 0.5 : 0,
        borderRadius:
          idx === SIGNAL_SOURCES.length - 1
            ? ([2, 2, 0, 0] as [number, number, number, number])
            : 0,
      },
    }));

    // Per-platform scatter overlay for high-density buckets. Each dot carries
    // its marker so the tooltip can render the full mention metadata.
    const dotsByPlatform = new Map<MentionPlatform, ScatterDot[]>();
    for (const dot of densityOverlay) {
      const arr = dotsByPlatform.get(dot.marker.platform) ?? [];
      arr.push(dot);
      dotsByPlatform.set(dot.marker.platform, arr);
    }
    const scatterSeries = Array.from(dotsByPlatform.entries()).map(
      ([platform, dots]) => ({
        type: "scatter" as const,
        yAxisIndex: 0,
        name: `${MENTION_PLATFORM_LABELS[platform]} dots`,
        symbolSize: 8,
        data: dots.map((d) => ({
          value: [d.ts, d.stars] as [number, number],
          marker: d.marker,
        })),
        itemStyle: {
          color: dots[0]?.marker.color ?? CHART_TOKENS.accent,
          borderColor:
            dots[0]?.marker.stroke ?? CHART_TOKENS.bgRaised,
          borderWidth: 1.5,
        },
      }),
    );

    return {
      grid: { top: 12, right: 36, bottom: 28, left: 60, containLabel: false },
      xAxis: {
        type: "time",
        min: xMin,
        max: xMax,
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 10,
          formatter: (value: number) =>
            new Date(value)
              .toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })
              .toUpperCase(),
          hideOverlap: true,
          margin: 12,
        },
      },
      yAxis: [
        {
          type: "value",
          position: "left",
          axisLabel: {
            color: CHART_TOKENS.textFaint,
            fontSize: 10,
            formatter: (value: number) => formatNumber(value),
          },
          splitLine: {
            lineStyle: { color: CHART_TOKENS.borderSubtle, type: "dashed" },
          },
        },
        {
          type: "value",
          position: "right",
          min: 0,
          max: rightAxisMax,
          interval: maxDailyMentions,
          axisLabel: {
            color: CHART_TOKENS.textFaint,
            fontSize: 10,
            formatter: (value: number) => (value === 0 ? "" : String(value)),
          },
          splitLine: { show: false },
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: {
            color: CHART_TOKENS.borderDefault,
            type: "dashed",
            width: 1,
          },
        },
        formatter: (params: TooltipParam | TooltipParam[]) => {
          const list = Array.isArray(params) ? params : [params];
          // Marker dot under cursor wins — show the rich link tooltip.
          const scatterHit = list.find(
            (p): p is ItemTooltipParam =>
              p.seriesType === "scatter" && "data" in p && Boolean(p.data?.marker),
          );
          if (scatterHit) {
            return renderMarkerTooltipHtml(scatterHit.data.marker);
          }
          // Otherwise fall back to the daily aggregate from the bucket.
          const ts =
            (list[0] as AxisTooltipParam | undefined)?.axisValue ?? null;
          if (ts === null) return "";
          const point = signalSeries.find((p) => p.ts === ts);
          if (!point) return "";
          const delta = starsDeltaByTs.get(point.ts) ?? 0;
          return renderSignalTooltipHtml(point, delta);
        },
      },
      series: [
        // Stacked mention bars (under the stars line).
        ...stackSeries,
        // Stars area on top.
        {
          type: "line",
          yAxisIndex: 0,
          name: "Stars",
          showSymbol: false,
          data: starsData,
          lineStyle: { width: 2, color: lineColor },
          emphasis: {
            itemStyle: {
              color: lineColor,
              borderColor: CHART_TOKENS.bgRaised,
              borderWidth: 2,
            },
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `rgba(${lineColorRgb}, 0.30)` },
                { offset: 1, color: `rgba(${lineColorRgb}, 0)` },
              ],
            },
          },
          z: 5,
          animationDuration: 0,
        },
        // Per-mention scatter overlay (above the area).
        ...scatterSeries,
      ],
    };
  }, [
    isSparse,
    signalSeries,
    densityOverlay,
    starsDeltaByTs,
    xMin,
    xMax,
    rightAxisMax,
    maxDailyMentions,
    lineColor,
    lineColorRgb,
  ]);

  // Click handler: open the marker URL in a new tab when a scatter dot is
  // clicked. Wired via onReady → instance.on("click").
  const onReady = useCallback((instance: ECharts) => {
    instance.on("click", (params: { seriesType?: string; data?: unknown }) => {
      if (params.seriesType !== "scatter" || !params.data) return;
      const data = params.data as { marker?: MentionMarker };
      const url = data.marker?.url;
      if (url && typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
  }, []);

  return (
    <ChartShell
      variant="chart"
      className="p-4"
      aria-label={`Star growth and daily mentions over ${periodDays} days`}
    >
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Stars + daily mention volume
          </h2>
          <p className="text-[11px] font-mono text-text-tertiary mt-0.5">
            {totalMentions > 0
              ? `${totalMentions} mention${totalMentions === 1 ? "" : "s"} across ${legendPlatforms.length} source${legendPlatforms.length === 1 ? "" : "s"} in this window`
              : "No cross-channel mentions in this window"}
          </p>
        </div>
        <div
          className="flex gap-px rounded-[2px] p-px"
          style={{
            background: "var(--v3-bg-100)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          {TIME_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTimeRange(tab.value)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-mono font-medium uppercase tracking-[0.16em] rounded-[1px] transition-colors",
              )}
              style={
                timeRange === tab.value
                  ? {
                      background: "var(--v3-acc-soft)",
                      color: "var(--v3-acc)",
                    }
                  : {
                      color: "var(--v3-ink-300)",
                    }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-wrap h-[180px] w-full sm:h-[220px] xl:h-[260px]">
        <div className="h-full w-full">
          {option === null ? (
            <div className="h-full w-full flex items-center justify-center">
              <p className="text-xs font-mono text-text-tertiary">
                Collecting star history...
              </p>
            </div>
          ) : (
            <EChart option={option} height="100%" onReady={onReady} />
          )}
        </div>
      </div>

      {legendPlatforms.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-mono text-text-tertiary">
          <span>{"// sources"}</span>
          {legendPlatforms.map((platform) => {
            const count = signalSeries.reduce(
              (acc, p) => acc + p.counts[platform],
              0,
            );
            return (
              <span
                key={platform}
                className="inline-flex items-center gap-1.5"
                title={`${count} ${MENTION_PLATFORM_LABELS[platform]} mention${count === 1 ? "" : "s"}`}
              >
                <span
                  className="size-2 rounded-sm"
                  style={{
                    backgroundColor: MENTION_PLATFORM_COLORS[platform],
                    border:
                      platform === "devto" ? "1px solid #ffffff" : undefined,
                  }}
                  aria-hidden
                />
                <span className="text-text-secondary">
                  {MENTION_PLATFORM_LABELS[platform]}
                </span>
                <span className="tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      )}
    </ChartShell>
  );
}

export default RepoDetailChart;
