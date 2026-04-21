"use client";

// Stars-only growth chart for /repo/[owner]/[name].
//
// Replaces the old combined Stars/Forks/Contributors RepoChart for this
// page. The combined chart shared a linear Y axis across three metrics
// with very different scales (e.g. 64.5k stars vs 5.6k forks vs 5
// contributors), which collapsed forks to a flatline and made the
// contributors series invisible. This component keeps the visual
// reserved for the Stars trend — Forks + Contributors get their own
// mini-cards in RepoDetailStatsStrip.
//
// Killer feature: every cross-channel mention (HN / Reddit / Bluesky /
// dev.to / ProductHunt) is plotted as a colored Scatter dot on the same
// time axis, hoverable to surface the post title + author + score, and
// clickable to open the source URL.
//
// Markers are pre-computed server-side in MentionMarkers.ts and shipped
// to the client as a flat MentionMarker[] so the client bundle doesn't
// transitively import every per-source mentions JSON file.

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
} from "./MentionMarkers";

interface RepoDetailChartProps {
  repo: Repo;
  markers: MentionMarker[];
}

const TIME_TABS: { label: string; value: TimeRange; days: number }[] = [
  { label: "24h", value: "24h", days: 1 },
  { label: "7d", value: "7d", days: 7 },
  { label: "30d", value: "30d", days: 30 },
];

interface SeriesPoint {
  /** Epoch ms — numeric x so Scatter markers can share the axis. */
  ts: number;
  stars: number;
}

const DAY_MS = 86_400_000;

/**
 * Build the per-day Stars series anchored to "today" with the on-disk
 * sparkline (cumulative star totals). Output is always exactly `days`
 * points, regardless of how many sparkline samples we have, so the X
 * axis honors the selected period tab even on cold/young repos.
 */
function buildStarsSeries(
  sparkline: number[],
  totalStars: number,
  days: number,
  nowMs: number,
): SeriesPoint[] {
  const safe = (sparkline ?? []).filter((n) => Number.isFinite(n));

  // Sparkline is cumulative-by-day in the modern pipeline; back-compat
  // with delta arrays is handled the same way RepoChart does it.
  const isCumulative = safe.every(
    (v, i) => i === 0 || v >= safe[i - 1] - 1,
  );
  const cumulative = isCumulative
    ? safe
    : safe.reduce<number[]>((acc, v, i) => {
        const prev = i === 0 ? 0 : acc[i - 1];
        acc.push(prev + v);
        return acc;
      }, []);

  // Anchor right edge to current total so the curve ends on the headline
  // value the rest of the page shows.
  const last = cumulative[cumulative.length - 1] || 1;
  const scale = totalStars > 0 ? totalStars / last : 1;
  const scaled = cumulative.map((v) => Math.round(v * scale));

  // Take the trailing `days` points; pad backward by repeating the first
  // value if the source series is too short.
  const slice =
    scaled.length >= days
      ? scaled.slice(scaled.length - days)
      : [
          ...new Array<number>(days - scaled.length).fill(
            scaled[0] ?? totalStars,
          ),
          ...scaled,
        ];

  // X-positions: one per day, anchored so the last point is "now" and
  // earlier points step back by 1 day.
  return slice.map((stars, i) => ({
    ts: nowMs - (days - 1 - i) * DAY_MS,
    stars,
  }));
}

/** Linear interpolation of the Stars series at an arbitrary timestamp. */
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
  /** Y position — anchored to the Stars curve so dots float on the line. */
  stars: number;
  marker: MentionMarker;
}

function truncate(s: string, n = 80): string {
  const trimmed = s.trim();
  if (trimmed.length <= n) return trimmed;
  return `${trimmed.slice(0, n - 1).trimEnd()}…`;
}

interface AreaTooltipPayloadEntry {
  name?: string;
  value?: number;
  payload?: SeriesPoint;
  color?: string;
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

  const date = new Date(point.ts);
  const dateLabel = date.toLocaleDateString("en-US", {
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
          <span
            className="size-1.5 rounded-full bg-up"
            aria-hidden
          />
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
  const sp = payload[0]?.payload;
  if (!sp) return null;
  const m = sp.marker;
  const date = new Date(m.xValue).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="bg-bg-card border border-border-primary rounded-card px-3 py-2 shadow-card max-w-[280px]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider"
          style={{ color: m.color }}
        >
          <span
            className="size-2 rounded-full"
            style={{
              backgroundColor: m.color,
              border: m.stroke ? `1px solid ${m.stroke}` : undefined,
            }}
            aria-hidden
          />
          {m.platformLabel}
        </span>
        <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
          {date}
        </span>
      </div>
      <p className="text-[12px] text-text-primary leading-snug mb-1">
        {truncate(m.title, 80)}
      </p>
      <div className="flex items-center justify-between text-[11px] font-mono text-text-tertiary tabular-nums">
        <span className="truncate">{m.author}</span>
        <span>
          <span className="text-text-secondary">{formatNumber(m.score)}</span>{" "}
          {m.scoreLabel}
        </span>
      </div>
    </div>
  );
}

/**
 * Custom shape so we can keep the dev.to dark dot visible, color each
 * platform per its brand color, and wire the click handler onto each
 * dot directly (recharts ComposedChart.onClick doesn't expose the
 * Scatter payload, only the active tooltip index).
 */
function MarkerShape(props: {
  cx?: number;
  cy?: number;
  payload?: ScatterPoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const m = payload.marker;
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        if (m.url && typeof window !== "undefined") {
          window.open(m.url, "_blank", "noopener,noreferrer");
        }
      }}
      style={{ cursor: m.url ? "pointer" : "default" }}
      role={m.url ? "link" : undefined}
      aria-label={`${m.platformLabel} mention: ${m.title}`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={m.color}
        stroke={m.stroke ?? "var(--color-bg-card)"}
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
    () => TIME_TABS.find((t) => t.value === timeRange)?.days ?? 30,
    [timeRange],
  );

  const nowMs = useMemo(() => Date.now(), []);

  const starsSeries = useMemo(
    () => buildStarsSeries(repo.sparklineData ?? [], repo.stars, periodDays, nowMs),
    [repo.sparklineData, repo.stars, periodDays, nowMs],
  );

  const xMin = starsSeries[0]?.ts ?? nowMs - periodDays * DAY_MS;
  const xMax = starsSeries[starsSeries.length - 1]?.ts ?? nowMs;

  // Filter markers to the visible window so they line up with the area
  // path; markers older than the period are silently dropped.
  const visibleMarkers = useMemo(
    () => markers.filter((m) => m.xValue >= xMin && m.xValue <= xMax),
    [markers, xMin, xMax],
  );

  // Per-platform Scatter datasets, each with the marker anchored to the
  // Stars curve at that timestamp.
  const scatterByPlatform = useMemo(() => {
    const map = new Map<MentionPlatform, ScatterPoint[]>();
    for (const m of visibleMarkers) {
      const stars = starsAt(starsSeries, m.xValue) ?? repo.stars;
      const point: ScatterPoint = { ts: m.xValue, stars, marker: m };
      const arr = map.get(m.platform);
      if (arr) arr.push(point);
      else map.set(m.platform, [point]);
    }
    return map;
  }, [visibleMarkers, starsSeries, repo.stars]);

  // Color/sign for the area gradient — green if Stars are up over the
  // selected window, red if down.
  const seriesDelta =
    starsSeries.length > 1
      ? starsSeries[starsSeries.length - 1].stars - starsSeries[0].stars
      : repo.starsDelta7d;
  const positive = seriesDelta >= 0;
  const lineColor = positive ? "var(--color-up)" : "var(--color-down)";

  const isSparse =
    starsSeries.length < 2 ||
    starsSeries.every((p) => p.stars === starsSeries[0].stars);

  return (
    <section className="bg-bg-card rounded-card p-4 border border-border-primary shadow-card">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Stars Growth
          </h2>
          <p className="text-[11px] font-mono text-text-tertiary mt-0.5">
            {visibleMarkers.length > 0
              ? `${visibleMarkers.length} cross-channel mention${visibleMarkers.length === 1 ? "" : "s"} on the timeline`
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

      <div className="h-[280px] w-full overflow-x-auto">
        <div className="h-full min-w-[520px]">
          {isSparse ? (
            <div className="h-full w-full flex items-center justify-center">
              <p className="text-xs font-mono text-text-tertiary">
                Collecting star history…
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={starsSeries}
                margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
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
                  tickFormatter={(v: number) =>
                    new Date(v).toLocaleDateString("en-US", {
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
                  tickFormatter={(v: number) => formatNumber(v)}
                  dx={-4}
                />
                <Tooltip
                  content={(props) => {
                    // Recharts payload entries can come from either the Area
                    // or the Scatter — the Scatter point carries `marker`.
                    const payload = (
                      props as {
                        active?: boolean;
                        payload?: ReadonlyArray<{ payload?: unknown }>;
                      }
                    ).payload;
                    const first = payload?.[0]?.payload;
                    if (
                      first &&
                      typeof first === "object" &&
                      "marker" in first
                    ) {
                      return (
                        <MarkerTooltip
                          active={props.active}
                          payload={
                            payload as ReadonlyArray<MarkerTooltipPayloadEntry>
                          }
                        />
                      );
                    }
                    return (
                      <AreaTooltip
                        active={props.active}
                        payload={
                          payload as ReadonlyArray<AreaTooltipPayloadEntry>
                        }
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
                {Array.from(scatterByPlatform.entries()).map(
                  ([platform, points]) => (
                    <Scatter
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

      {/* Marker legend — only render platforms that actually fired in the
          visible window. Keeps the strip focused and avoids dead chips. */}
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
