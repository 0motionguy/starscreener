"use client";

// Stars-only growth chart for /repo/[owner]/[name].

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Repo, TimeRange } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import {
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

interface SeriesPoint {
  ts: number;
  stars: number;
}

const DAY_MS = 86_400_000;

function buildStarsSeries(
  sparkline: number[],
  totalStars: number,
  days: number,
  nowMs: number,
): SeriesPoint[] {
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

  const slice =
    scaled.length >= days
      ? scaled.slice(scaled.length - days)
      : [
          ...new Array<number>(days - scaled.length).fill(
            scaled[0] ?? totalStars,
          ),
          ...scaled,
        ];

  return slice.map((stars, i) => ({
    ts: nowMs - (days - 1 - i) * DAY_MS,
    stars,
  }));
}

function starsAt(series: SeriesPoint[], ts: number): number | null {
  if (series.length === 0) return null;
  if (ts <= series[0].ts) return series[0].stars;
  if (ts >= series[series.length - 1].ts) {
    return series[series.length - 1].stars;
  }
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i];
    const b = series[i + 1];
    if (ts >= a.ts && ts <= b.ts) {
      const t = (ts - a.ts) / (b.ts - a.ts);
      return Math.round(a.stars + (b.stars - a.stars) * t);
    }
  }
  return null;
}

interface ScatterPoint {
  ts: number;
  stars: number;
  marker: MentionMarker;
}

function truncate(text: string, max = 80): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
}

interface AreaTooltipPayloadEntry {
  name?: string;
  value?: number;
  payload?: SeriesPoint;
}

function AreaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<AreaTooltipPayloadEntry>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const dateLabel = new Date(point.ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-bg-card border border-border-primary rounded-card px-3 py-2 shadow-card min-w-[180px]">
      <p className="text-[11px] font-mono text-text-tertiary mb-1.5">
        {dateLabel}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] text-text-secondary inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-up" aria-hidden />
          Stars
        </span>
        <span className="font-mono text-xs text-text-primary tabular-nums">
          {formatNumber(point.stars)}
        </span>
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
    <div className="bg-bg-card border border-border-primary rounded-card px-3 py-2 shadow-card max-w-[280px]">
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
        r={5}
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

  const starsSeries = useMemo(
    () =>
      buildStarsSeries(repo.sparklineData ?? [], repo.stars, periodDays, nowMs),
    [repo.sparklineData, repo.stars, periodDays, nowMs],
  );

  const xMin = starsSeries[0]?.ts ?? nowMs - periodDays * DAY_MS;
  const xMax = starsSeries[starsSeries.length - 1]?.ts ?? nowMs;

  const visibleMarkers = useMemo(
    () => markers.filter((marker) => marker.xValue >= xMin && marker.xValue <= xMax),
    [markers, xMin, xMax],
  );

  const scatterByPlatform = useMemo(() => {
    const map = new Map<MentionPlatform, ScatterPoint[]>();
    for (const marker of visibleMarkers) {
      const stars = starsAt(starsSeries, marker.xValue) ?? repo.stars;
      const point: ScatterPoint = { ts: marker.xValue, stars, marker };
      const bucket = map.get(marker.platform);
      if (bucket) bucket.push(point);
      else map.set(marker.platform, [point]);
    }
    return map;
  }, [visibleMarkers, starsSeries, repo.stars]);

  const seriesDelta =
    starsSeries.length > 1
      ? starsSeries[starsSeries.length - 1].stars - starsSeries[0].stars
      : repo.starsDelta7d;
  const positive = seriesDelta >= 0;
  const lineColor = positive ? "var(--color-up)" : "var(--color-down)";

  const isSparse =
    starsSeries.length < 2 ||
    starsSeries.every((point) => point.stars === starsSeries[0].stars);

  return (
    <section className="bg-bg-card rounded-card p-4 border border-border-primary shadow-card">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Stars + mention dots
          </h2>
          <p className="text-[11px] font-mono text-text-tertiary mt-0.5">
            {visibleMarkers.length > 0
              ? `${visibleMarkers.length} mention dot${visibleMarkers.length === 1 ? "" : "s"} on this window`
              : "No cross-channel mentions in this window"}
          </p>
        </div>
        <div className="flex gap-1 bg-bg-secondary rounded-badge p-0.5">
          {TIME_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTimeRange(tab.value)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-badge transition-all",
                timeRange === tab.value
                  ? "bg-bg-card text-text-primary shadow-card"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[180px] w-full sm:h-[220px] xl:h-[260px]">
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
                data={starsSeries}
                margin={{ top: 10, right: 12, bottom: 8, left: 4 }}
              >
                <defs>
                  <linearGradient id="repo-detail-stars-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--color-border-primary)"
                  strokeOpacity={0.4}
                  vertical={false}
                />
                <XAxis
                  type="number"
                  dataKey="ts"
                  domain={[xMin, xMax]}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--color-text-tertiary)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickCount={periodDays <= 7 ? periodDays : 6}
                  tickFormatter={(value: number) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  dy={8}
                />
                <YAxis
                  type="number"
                  dataKey="stars"
                  domain={["auto", "auto"]}
                  axisLine={false}
                  tickLine={false}
                  tickCount={5}
                  tick={{
                    fill: "var(--color-text-tertiary)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  tickFormatter={(value: number) => formatNumber(value)}
                  width={54}
                />
                <Tooltip
                  content={(props) => {
                    const payload = (
                      props as {
                        active?: boolean;
                        payload?: ReadonlyArray<{ payload?: unknown }>;
                      }
                    ).payload;
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
                      <AreaTooltip
                        active={props.active}
                        payload={payload as ReadonlyArray<AreaTooltipPayloadEntry>}
                      />
                    );
                  }}
                  cursor={{
                    stroke: "var(--color-border-primary)",
                    strokeDasharray: "4 4",
                  }}
                />
                <Area
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
                {Array.from(scatterByPlatform.entries()).map(([platform, points]) => (
                  <Scatter
                    key={platform}
                    name={MENTION_PLATFORM_LABELS[platform]}
                    data={points}
                    shape={MarkerShape}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {visibleMarkers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-mono text-text-tertiary">
          <span>{"// markers"}</span>
          {Array.from(scatterByPlatform.entries()).map(([platform, points]) => (
            <span
              key={platform}
              className="inline-flex items-center gap-1.5"
              title={`${points.length} ${MENTION_PLATFORM_LABELS[platform]} mention${points.length === 1 ? "" : "s"}`}
            >
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor: points[0].marker.color,
                  border: points[0].marker.stroke
                    ? `1px solid ${points[0].marker.stroke}`
                    : undefined,
                }}
                aria-hidden
              />
              <span className="text-text-secondary">
                {MENTION_PLATFORM_LABELS[platform]}
              </span>
              <span className="tabular-nums">{points.length}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default RepoDetailChart;
