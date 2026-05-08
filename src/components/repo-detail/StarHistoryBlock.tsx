// // 02 GROWTH — 90-day star history chart + bottom stats strip.
//
// Inlines the chart that previously only lived at the /star-activity sub-route.
// The sub-route stays as a deep-dive surface (toggles, compare, share-card)
// and is reachable via the "full chart →" link at the top-right of this block.
//
// Reads `getStarActivity(repo.fullName)` (already refreshed at the page level
// via refreshStarActivityFromStore). When no series is available (cold-start
// repo or backfill miss), renders a placeholder strip with delta-only stats.

import Link from "next/link";
import type { JSX } from "react";
import { ChartStat, ChartStats } from "@/components/ui/ChartShell";
import { StarHistoryChart } from "@/components/repo-detail/StarHistoryChart";
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";
import {
  getStarActivity,
  type StarActivityPoint,
} from "@/lib/star-activity";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { Repo } from "@/lib/types";

interface StarHistoryBlockProps {
  repo: Repo;
}

const WINDOW_DAYS = 90;

interface DerivedStats {
  todayStars: number;
  todayDelta: number;
  weekDelta: number;
  monthDelta: number;
  spike: { date: string; delta: number } | null;
}

function deriveStats(points: StarActivityPoint[]): DerivedStats {
  if (points.length === 0) {
    return {
      todayStars: 0,
      todayDelta: 0,
      weekDelta: 0,
      monthDelta: 0,
      spike: null,
    };
  }
  const last = points[points.length - 1];
  const todayStars = last.s;
  const todayDelta = last.delta;
  const sliceFromBack = (n: number): StarActivityPoint | null =>
    points.length > n ? points[points.length - 1 - n] : (points[0] ?? null);
  const weekStart = sliceFromBack(7);
  const monthStart = sliceFromBack(30);
  const weekDelta = weekStart ? last.s - weekStart.s : 0;
  const monthDelta = monthStart ? last.s - monthStart.s : 0;
  // Spike = the day with the highest single-day delta in the window.
  let spike: { date: string; delta: number } | null = null;
  for (const p of points) {
    if (!spike || p.delta > spike.delta) {
      spike = { date: p.d, delta: p.delta };
    }
  }
  if (spike && spike.delta <= 0) spike = null;
  return { todayStars, todayDelta, weekDelta, monthDelta, spike };
}

function buildOption(
  points: StarActivityPoint[],
  spike: DerivedStats["spike"],
) {
  const data = points.map((p) => [p.d, p.s] as [string, number]);
  return {
    grid: {
      left: 48,
      right: 16,
      top: 16,
      bottom: 28,
    },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const },
    },
    xAxis: {
      type: "time" as const,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value" as const,
      scale: true,
      axisLabel: { formatter: "{value}" },
    },
    series: [
      {
        name: "Stars",
        type: "line" as const,
        showSymbol: false,
        smooth: true,
        data,
        lineStyle: { color: CHART_TOKENS.positive, width: 2 },
        areaStyle: { color: CHART_TOKENS.positive, opacity: 0.18 },
        markPoint:
          spike && spike.date
            ? {
                symbol: "circle",
                symbolSize: 8,
                itemStyle: { color: CHART_TOKENS.accent },
                label: {
                  show: true,
                  formatter: `+${formatNumber(spike.delta)}/d`,
                  color: CHART_TOKENS.accent,
                  fontFamily: "var(--font-geist-mono, monospace)",
                  fontSize: 10,
                  position: "top" as const,
                  offset: [0, -6],
                },
                data: [{ coord: [spike.date, lookupStarsAt(points, spike.date)] }],
              }
            : undefined,
      },
    ],
  };
}

function lookupStarsAt(points: StarActivityPoint[], date: string): number {
  const hit = points.find((p) => p.d === date);
  return hit ? hit.s : 0;
}

export function StarHistoryBlock({ repo }: StarHistoryBlockProps): JSX.Element {
  const payload = getStarActivity(repo.fullName);
  const allPoints = payload?.points ?? [];
  const points = allPoints.slice(-WINDOW_DAYS);
  const stats = deriveStats(points);
  const wow =
    stats.weekDelta !== 0 && stats.todayStars - stats.weekDelta > 0
      ? Math.round(
          (stats.weekDelta /
            Math.max(1, stats.todayStars - stats.weekDelta)) *
            100,
        )
      : null;
  const mom =
    stats.monthDelta !== 0 && stats.todayStars - stats.monthDelta > 0
      ? Math.round(
          (stats.monthDelta /
            Math.max(1, stats.todayStars - stats.monthDelta)) *
            100,
        )
      : null;

  const hasSeries = points.length >= 2;
  const option = hasSeries ? buildOption(points, stats.spike) : null;
  const fullHref = `/repo/${repo.owner}/${repo.name}/star-activity`;

  return (
    <section className="star-history-block">
      <header className="shb-head">
        <span className="shb-eyebrow">{"// STAR HISTORY · "}{repo.name.toUpperCase()}{" · "}{WINDOW_DAYS}{" DAY · CUMULATIVE"}</span>
        <Link href={fullHref} className="shb-full-link">
          full chart →
        </Link>
      </header>
      <div className="shb-chart">
        {option ? (
          <StarHistoryChart
            option={option}
            ariaLabel={`${repo.fullName} cumulative stars over the last ${WINDOW_DAYS} days`}
          />
        ) : (
          <div className="shb-empty">
            <span>No daily star history collected yet.</span>
            <Link href={fullHref}>open star-activity →</Link>
          </div>
        )}
      </div>
      <ChartStats columns={4}>
        <ChartStat
          label="Today"
          value={formatNumber(stats.todayStars)}
          sub={`${stats.todayDelta >= 0 ? "+" : ""}${formatNumber(stats.todayDelta)} last 24h`}
        />
        <ChartStat
          label="7d"
          value={`${stats.weekDelta >= 0 ? "+" : ""}${formatNumber(stats.weekDelta)}`}
          sub={wow !== null ? `${wow}% wow` : "rolling"}
        />
        <ChartStat
          label="30d"
          value={`${stats.monthDelta >= 0 ? "+" : ""}${formatNumber(stats.monthDelta)}`}
          sub={mom !== null ? `${mom}% mom` : "rolling"}
        />
        <ChartStat
          label="Spike"
          value={
            stats.spike
              ? `+${formatNumber(stats.spike.delta)}/d`
              : "none"
          }
          sub={
            stats.spike
              ? `${getRelativeTime(stats.spike.date)} · peak day`
              : "no breakout in window"
          }
        />
      </ChartStats>
      <style>{`
        .star-history-block {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 14px 14px 12px;
          border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
          border-radius: 3px;
          background: var(--v3-bg-050, rgba(255,255,255,0.025));
        }
        .shb-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .shb-eyebrow {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.16em;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
          text-transform: uppercase;
        }
        .shb-full-link {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--v3-acc, #ffcb05);
          text-transform: uppercase;
          text-decoration: none;
        }
        .shb-full-link:hover { text-decoration: underline; }
        .shb-chart { width: 100%; min-height: 280px; }
        .shb-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 280px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 12px;
          color: var(--v3-ink-300);
          border: 1px dashed var(--v3-line-100);
          border-radius: 2px;
        }
        .shb-empty a {
          color: var(--v3-acc, #ffcb05);
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-decoration: none;
        }
      `}</style>
    </section>
  );
}

export default StarHistoryBlock;
