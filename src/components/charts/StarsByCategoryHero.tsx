"use client";

// StarsByCategoryHero — the home-page hero "Daily GitHub stars · stacked by
// category" chart. Reads the worker-aggregated `stars-by-category-daily` slug
// (90-day rolling window, 7 hero bands) and paints one Aurora stackedBars
// chart with an honest freshness pill.
//
// Why a client island: AuroraChart wraps Recharts, which is client-only. The
// server page loads + projects the data; this component just renders.
//
// Honesty rules:
//   - No fabricated days. If the worker has nothing yet, render the empty
//     state with the real cause (e.g. "Aggregating — back shortly").
//   - Freshness pip is "live" only when the slug is < 36h old (the worker
//     runs daily at 06:00 UTC, so > 36h means we missed a tick).

import { useMemo } from "react";

import { AuroraChart, type AuroraSeries, shortDate } from "@/components/charts/AuroraChart";
import {
  HERO_CATEGORIES,
  type StarsByCategoryChartData,
} from "@/lib/stars-by-category";

interface Props {
  data: StarsByCategoryChartData;
}

const FRESH_BUDGET_MS = 36 * 3_600_000;

export function StarsByCategoryHero({ data }: Props) {
  const series: AuroraSeries[] = useMemo(
    () =>
      HERO_CATEGORIES.map((cat) => ({
        dataKey: cat.id,
        name: cat.label,
        color: cat.color,
      })),
    [],
  );

  const empty = data.points.length === 0;
  const grandTotal = useMemo(
    () =>
      data.points.reduce(
        (sum, p) =>
          sum +
          HERO_CATEGORIES.reduce(
            (s, cat) => s + ((p[cat.id] as number | undefined) ?? 0),
            0,
          ),
        0,
      ),
    [data.points],
  );

  return (
    <section className="hero-stars-by-cat" aria-label="Daily GitHub stars, stacked by category">
      <header className="hero-stars-head">
        <div className="hero-stars-titles">
          <h2 className="hero-stars-title">
            Daily GitHub stars · stacked by category
          </h2>
          <p className="hero-stars-sub">
            {empty ? (
              "Aggregating — back shortly."
            ) : (
              <>
                {data.totalRepos.toLocaleString()} repos tracked ·{" "}
                {data.windowDays}D window · {formatStars(grandTotal)} new stars
              </>
            )}
          </p>
        </div>
        <FreshBadge iso={data.fetchedAt} />
      </header>

      {empty ? (
        <div className="hero-stars-empty" role="status">
          No aggregated data yet. The worker re-runs daily at 06:00 UTC.
        </div>
      ) : (
        <>
          <div className="hero-stars-chart">
            <AuroraChart
              data={data.points}
              series={series}
              xKey="d"
              variant="stackedBars"
              height={300}
              xFormatter={shortDate}
              yFormatter={formatStars}
              tooltipFormatter={(n) => `${formatStars(n)} stars`}
              tooltipLabelFormatter={(d) => String(d)}
              ariaLabel="Daily star gains per category over the last 90 days"
            />
          </div>
          <ul
            className="hero-stars-legend"
            role="list"
            aria-label="Category bands"
          >
            {HERO_CATEGORIES.map((cat) => (
              <li key={cat.id} className="hero-stars-legend-item">
                <span
                  className="hero-stars-swatch"
                  aria-hidden="true"
                  style={{ background: cat.color }}
                />
                {cat.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// --- helpers ---------------------------------------------------------------

function FreshBadge({ iso }: { iso: string }) {
  const tMs = Date.parse(iso);
  const age = Number.isFinite(tMs) ? Date.now() - tMs : Number.POSITIVE_INFINITY;
  const live = age < FRESH_BUDGET_MS;
  return (
    <span className={`fresh${live ? " fresh-live" : ""}`}>
      {live && <span className="pip" aria-hidden="true" />} stars-by-category ·{" "}
      {fmtAge(age)}
    </span>
  );
}

function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function formatStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return Math.round(n).toLocaleString();
}
