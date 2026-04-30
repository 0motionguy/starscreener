"use client";

// Dual-series signal timeline for /repo/[owner]/[name]:
//   * stars growth (area, left Y-axis)
//   * daily mention volume stacked by source (bars, right Y-axis)
//   * optional per-mention dots for high-density days (compact overlay)
// Causality question ("did mentions spike BEFORE stars or AFTER?") becomes
// visible by putting both series on the same calendar x-axis.

import { useCallback, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Repo, TimeRange } from "@/lib/types";
import { ChartShell } from "@/components/ui/ChartShell";
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
  // Left-pad with the first known value (or totalStars if series is empty) so
  // the plotted line still covers the full window cleanly.
  const pad = new Array<number>(days - scaled.length).fill(
    scaled[0] ?? totalStars,
  );
  return [...pad, ...scaled];
}

/**
 * Roll per-mention markers up into a per-day stacked-count series and align
 * stars on the same UTC day buckets.
 *
 * Note: on the 24h and 7d tabs the bucket size is still 1 day, so the mention
 * bars can look sparse or empty — daily granularity is the smallest the
 * ingestion cadence guarantees. See comment in the TIME_TABS handler.
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

interface ScatterPoint {
  ts: number;
  stars: number;
  marker: MentionMarker;
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

interface SignalTooltipPayloadEntry {
  payload?: SignalPoint;
}

function SignalTooltip({
  active,
  payload,
  starsDeltaByTs,
}: {
  active?: boolean;
  payload?: ReadonlyArray<SignalTooltipPayloadEntry>;
  starsDeltaByTs: Map<number, number>;
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
  const delta = starsDeltaByTs.get(point.ts) ?? 0;
  const deltaLabel =
    delta === 0 ? "±0" : delta > 0 ? `+${formatNumber(delta)}` : `-${formatNumber(Math.abs(delta))}`;
  const deltaColor =
    delta > 0
      ? "var(--color-up)"
      : delta < 0
        ? "var(--color-down)"
        : "var(--color-text-tertiary)";

  const activeSources = SIGNAL_SOURCES.filter((src) => point.counts[src] > 0);

  return (
    <div className="v2-card px-3 py-2 min-w-[200px]">
      <p className="text-[11px] font-mono text-text-tertiary mb-1.5">
        {dateLabel}
      </p>
      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="text-[11px] text-text-secondary inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-up" aria-hidden />
          Stars
        </span>
        <span className="font-mono text-xs text-text-primary tabular-nums">
          {formatNumber(point.stars)}{" "}
          <span
            className="text-[10px]"
            style={{ color: deltaColor }}
          >
            {deltaLabel}
          </span>
        </span>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border-primary">
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
            Mentions
          </span>
          <span className="font-mono text-xs text-text-primary tabular-nums">
            {point.total}
          </span>
        </div>
        {activeSources.length === 0 ? (
          <p className="text-[10px] font-mono text-text-tertiary italic">
            no mentions this day
          </p>
        ) : (
          <ul className="space-y-0.5">
            {activeSources.map((src) => (
              <li
                key={src}
                className="flex items-center justify-between gap-3 text-[10px] font-mono"
              >
                <span className="inline-flex items-center gap-1.5 text-text-secondary">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: MENTION_PLATFORM_COLORS[src] }}
                    aria-hidden
                  />
                  {MENTION_PLATFORM_LABELS[src]}
                </span>
                <span className="text-text-primary tabular-nums">
                  {point.counts[src]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface MarkerTooltipPayloadEntry {
  payload?: ScatterPoint;
}

function MarkerTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<MarkerTooltipPayloadEntry>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const marker = point.marker;
  const date = new Date(marker.xValue).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="v2-card px-3 py-2 max-w-[280px]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider"
          style={{ color: marker.color }}
        >
          <span
            className="size-2 rounded-full"
            style={{
              backgroundColor: marker.color,
              border: marker.stroke ? `1px solid ${marker.stroke}` : undefined,
            }}
            aria-hidden
          />
          {marker.platformLabel}
        </span>
        <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
          {date}
        </span>
      </div>
      <p className="text-[12px] text-text-primary leading-snug mb-1">
        {truncate(marker.title, 80)}
      </p>
      <div className="flex items-center justify-between text-[11px] font-mono text-text-tertiary tabular-nums">
        <span className="truncate">{marker.author}</span>
        <span>
          <span className="text-text-secondary">
            {formatNumber(marker.score)}
          </span>{" "}
          {marker.scoreLabel}
        </span>
      </div>
    </div>
  );
}

function MarkerShape(props: {
  cx?: number;
  cy?: number;
  payload?: ScatterPoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const marker = payload.marker;
  return (
    <g
      onClick={(event) => {
        event.stopPropagation();
        if (marker.url && typeof window !== "undefined") {
          window.open(marker.url, "_blank", "noopener,noreferrer");
        }
      }}
      style={{ cursor: marker.url ? "pointer" : "default" }}
      role={marker.url ? "link" : undefined}
      aria-label={`${marker.platformLabel} mention: ${marker.title}`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={marker.color}
        stroke={marker.stroke ?? "var(--color-bg-card)"}
        strokeWidth={1.5}
      />
    </g>
  );
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

  // Per-bucket stars delta (today's stars - yesterday's stars) for the
  // tooltip, computed once.
  const starsDeltaByTs = useMemo(() => {
    const out = new Map<number, number>();
    for (let i = 0; i < signalSeries.length; i++) {
      const point = signalSeries[i];
      const prev = i === 0 ? point.stars : signalSeries[i - 1].stars;
      out.set(point.ts, point.stars - prev);
    }
    return out;
  }, [signalSeries]);

  // Stable Tooltip content callback. Inlining `content={(props) => ...}`
  // forced Recharts to remount the tooltip every render because the prop
  // identity changed; useCallback keyed on starsDeltaByTs preserves the
  // reference between hovers. (Recharts TooltipProps typing per UI-16.)
  const renderTooltipContent = useCallback(
    (props: {
      active?: boolean;
      payload?: ReadonlyArray<{ payload?: unknown }>;
    }) => {
      const payload = props.payload;
      const first = payload?.[0]?.payload;
      if (first && typeof first === "object" && "marker" in first) {
        return (
          <MarkerTooltip
            active={props.active}
            payload={payload as ReadonlyArray<MarkerTooltipPayloadEntry>}
          />
        );
      }
      return (
        <SignalTooltip
          active={props.active}
          payload={payload as ReadonlyArray<SignalTooltipPayloadEntry>}
          starsDeltaByTs={starsDeltaByTs}
        />
      );
    },
    [starsDeltaByTs],
  );

  const visibleMarkers = useMemo(
    () =>
      markers.filter(
        (marker) => marker.xValue >= xMin && marker.xValue <= xMax + DAY_MS,
      ),
    [markers, xMin, xMax],
  );

  // Optional per-mention dot overlay: only render dots on days that already
  // carry >=2 mentions (i.e., high-density). On sparse days the stacked bar
  // is enough; keeps the chart legible.
  const densityOverlay = useMemo<ScatterPoint[]>(() => {
    const highDensityBuckets = new Set<number>();
    for (const point of signalSeries) {
      if (point.total >= 2) highDensityBuckets.add(point.ts);
    }
    if (highDensityBuckets.size === 0) return [];
    const out: ScatterPoint[] = [];
    for (const marker of visibleMarkers) {
      const bucket = startOfDayUtc(marker.xValue);
      if (!highDensityBuckets.has(bucket)) continue;
      const stars = starsAtBucket(signalSeries, marker.xValue) ?? repo.stars;
      out.push({ ts: marker.xValue, stars, marker });
    }
    return out;
  }, [signalSeries, visibleMarkers, repo.stars]);

  const dotsByPlatform = useMemo(() => {
    const map = new Map<MentionPlatform, ScatterPoint[]>();
    for (const point of densityOverlay) {
      const bucket = map.get(point.marker.platform);
      if (bucket) bucket.push(point);
      else map.set(point.marker.platform, [point]);
    }
    return map;
  }, [densityOverlay]);

  const seriesDelta =
    signalSeries.length > 1
      ? signalSeries[signalSeries.length - 1].stars - signalSeries[0].stars
      : repo.starsDelta7d;
  const positive = seriesDelta >= 0;
  const lineColor = positive ? "var(--color-up)" : "var(--color-down)";

  const isSparse =
    signalSeries.length < 2 ||
    signalSeries.every((point) => point.stars === signalSeries[0].stars);

  const totalMentions = visibleMarkers.length;

  // Right Y-axis (mention bars) max: cap so bars live in ~bottom 30% of the
  // canvas. We pass an explicit domain of [0, cap] where cap = 3.3x the
  // busiest day; recharts renders the bar heights against that scale, which
  // visually compresses them.
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
          {isSparse ? (
            <div className="h-full w-full flex items-center justify-center">
              <p className="text-xs font-mono text-text-tertiary">
                Collecting star history...
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={signalSeries}
                margin={{ top: 10, right: 12, bottom: 8, left: 4 }}
                barCategoryGap="20%"
              >
                <defs>
                  <linearGradient
                    id="repo-detail-stars-grad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                    <stop
                      offset="100%"
                      stopColor={lineColor}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--v3-line-200)"
                  strokeOpacity={0.35}
                  vertical={false}
                />
                <XAxis
                  type="number"
                  dataKey="ts"
                  domain={[xMin, xMax]}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--v3-ink-400)",
                    fontSize: 10,
                    fontFamily: "var(--font-geist-mono), monospace",
                    letterSpacing: "0.12em",
                  }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickCount={periodDays <= 7 ? periodDays : 6}
                  tickFormatter={(value: number) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                  }
                  dy={8}
                  scale="time"
                />
                <YAxis
                  yAxisId="left"
                  type="number"
                  dataKey="stars"
                  domain={["auto", "auto"]}
                  axisLine={false}
                  tickLine={false}
                  tickCount={5}
                  tick={{
                    fill: "var(--v3-ink-400)",
                    fontSize: 10,
                    fontFamily: "var(--font-geist-mono), monospace",
                    letterSpacing: "0.12em",
                  }}
                  tickFormatter={(value: number) => formatNumber(value)}
                  width={54}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  type="number"
                  domain={[0, rightAxisMax]}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--v3-ink-400)",
                    fontSize: 10,
                    fontFamily: "var(--font-geist-mono), monospace",
                    letterSpacing: "0.12em",
                  }}
                  tickFormatter={(value: number) =>
                    value === 0 ? "" : String(value)
                  }
                  width={28}
                  // Ticks only in the visible range (bars live in bottom ~30%)
                  ticks={[0, Math.ceil(maxDailyMentions)].filter(
                    (v, i, a) => a.indexOf(v) === i,
                  )}
                />
                <Tooltip
                  // Recharts ships TooltipProps but its ContentType callback
                  // receives a partial subset that doesn't expose `payload`
                  // directly — keeping the localized `as` narrowing in
                  // renderTooltipContent above. Tracked under audit UI-16.
                  content={renderTooltipContent as never}
                  cursor={{
                    stroke: "var(--v3-line-300)",
                    strokeDasharray: "4 4",
                    strokeOpacity: 0.6,
                  }}
                />

                {/* Stacked mention bars (one <Bar> per source) - bottom layer */}
                {SIGNAL_SOURCES.map((src, idx) => (
                  <Bar
                    key={src}
                    yAxisId="right"
                    // Recharts supports dot-notation string dataKeys for nested
                    // fields. The fn-form `(p) => p.counts[src]` was un-cacheable
                    // in Recharts' fast path; the string form lets Recharts
                    // memoize the per-bar accessor (UI-14).
                    dataKey={`counts.${src}`}
                    name={MENTION_PLATFORM_LABELS[src]}
                    stackId="mentions"
                    fill={MENTION_PLATFORM_COLORS[src]}
                    stroke={src === "devto" ? "#ffffff" : undefined}
                    strokeWidth={src === "devto" ? 0.5 : 0}
                    // Only round the topmost visible stack segment; recharts
                    // handles this automatically when radius is set on the
                    // last bar of the stack.
                    radius={
                      idx === SIGNAL_SOURCES.length - 1 ? [2, 2, 0, 0] : 0
                    }
                    isAnimationActive={false}
                    maxBarSize={14}
                  />
                ))}

                {/* Stars area (top layer) */}
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="stars"
                  name="Stars"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill="url(#repo-detail-stars-grad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: lineColor,
                    stroke: "var(--color-bg-card)",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />

                {/* Optional compact per-mention dot overlay for high-density days */}
                {Array.from(dotsByPlatform.entries()).map(
                  ([platform, points]) => (
                    <Scatter
                      yAxisId="left"
                      key={platform}
                      name={MENTION_PLATFORM_LABELS[platform]}
                      data={points}
                      shape={MarkerShape}
                      isAnimationActive={false}
                    />
                  ),
                )}
              </ComposedChart>
            </ResponsiveContainer>
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
