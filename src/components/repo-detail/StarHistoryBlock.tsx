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
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";
import {
  getStarActivity,
  type StarActivityPoint,
} from "@/lib/star-activity";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { Repo } from "@/lib/types";

export interface StarHistoryBlockProps {
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

interface SvgPoint {
  x: number;
  y: number;
  point: StarActivityPoint;
}

function buildChartGeometry(points: StarActivityPoint[]): {
  linePath: string;
  areaPath: string;
  svgPoints: SvgPoint[];
  minStars: number;
  maxStars: number;
} {
  const width = 720;
  const height = 280;
  const left = 48;
  const right = 16;
  const top = 16;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.map((point) => point.s);
  const minStars = Math.min(...values);
  const maxStars = Math.max(...values);
  const range = Math.max(1, maxStars - minStars);

  const svgPoints = points.map((point, index) => {
    const x =
      points.length === 1
        ? left + plotWidth
        : left + (index / (points.length - 1)) * plotWidth;
    const y = top + (1 - (point.s - minStars) / range) * plotHeight;
    return { x, y, point };
  });

  const linePath = svgPoints
    .map(
      (item, index) =>
        `${index === 0 ? "M" : "L"}${item.x.toFixed(2)} ${item.y.toFixed(2)}`,
    )
    .join(" ");
  const first = svgPoints[0];
  const last = svgPoints[svgPoints.length - 1];
  const baseline = height - bottom;
  const areaPath =
    first && last
      ? `${linePath} L${last.x.toFixed(2)} ${baseline} L${first.x.toFixed(2)} ${baseline} Z`
      : "";

  return { linePath, areaPath, svgPoints, minStars, maxStars };
}

function StarHistorySvg({
  points,
  spike,
  ariaLabel,
}: {
  points: StarActivityPoint[];
  spike: DerivedStats["spike"];
  ariaLabel: string;
}): JSX.Element {
  const { linePath, areaPath, svgPoints, minStars, maxStars } =
    buildChartGeometry(points);
  const spikePoint = spike
    ? svgPoints.find((item) => item.point.d === spike.date)
    : null;
  const start = svgPoints[0]?.point;
  const end = svgPoints[svgPoints.length - 1]?.point;

  return (
    <svg
      className="shb-svg"
      viewBox="0 0 720 280"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="shb-area" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={CHART_TOKENS.positive}
            stopOpacity="0.24"
          />
          <stop
            offset="100%"
            stopColor={CHART_TOKENS.positive}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <line className="shb-grid" x1="48" y1="16" x2="704" y2="16" />
      <line className="shb-grid" x1="48" y1="134" x2="704" y2="134" />
      <line className="shb-grid" x1="48" y1="252" x2="704" y2="252" />
      <text className="shb-axis" x="8" y="20">
        {formatNumber(maxStars)}
      </text>
      <text className="shb-axis" x="8" y="254">
        {formatNumber(minStars)}
      </text>
      {start ? (
        <text className="shb-axis shb-date" x="48" y="274">
          {start.d.slice(5)}
        </text>
      ) : null}
      {end ? (
        <text className="shb-axis shb-date" x="704" y="274" textAnchor="end">
          {end.d.slice(5)}
        </text>
      ) : null}
      <path d={areaPath} fill="url(#shb-area)" />
      <path d={linePath} className="shb-line" />
      {spike && spikePoint ? (
        <g>
          <circle
            cx={spikePoint.x}
            cy={spikePoint.y}
            r="4"
            fill={CHART_TOKENS.accent}
          />
          <text
            className="shb-spike"
            x={Math.min(660, Math.max(72, spikePoint.x))}
            y={Math.max(16, spikePoint.y - 12)}
            textAnchor="middle"
          >
            +{formatNumber(spike.delta)}/d
          </text>
        </g>
      ) : null}
    </svg>
  );
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
        {hasSeries ? (
          <StarHistorySvg
            points={points}
            spike={stats.spike}
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
        .shb-svg {
          display: block;
          width: 100%;
          height: 280px;
          overflow: visible;
        }
        .shb-grid {
          stroke: var(--v3-line-100, rgba(255,255,255,0.08));
          stroke-dasharray: 3 5;
        }
        .shb-line {
          fill: none;
          stroke: ${CHART_TOKENS.positive};
          stroke-width: 2;
          vector-effect: non-scaling-stroke;
        }
        .shb-axis,
        .shb-spike {
          fill: var(--v3-ink-300, rgba(255,255,255,0.7));
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.08em;
          font-variant-numeric: tabular-nums;
        }
        .shb-date {
          fill: var(--v3-ink-250, rgba(255,255,255,0.55));
        }
        .shb-spike {
          fill: ${CHART_TOKENS.accent};
          font-weight: 700;
        }
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
