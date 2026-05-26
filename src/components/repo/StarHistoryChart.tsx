"use client";

// StarHistoryChart — card shell that wraps the unified `<AuroraChart>`
// Recharts primitive. Renders a window-filterable star history line, an
// optional dashed npm-downloads overlay on a second y-axis (when the repo
// has a canonical npm package), and dashed event markers fed from real
// GitHub release events + cross-source mentions.
//
// Marked "use client" because it forwards function props (yFormatter,
// xFormatter, tooltipFormatter) into <AuroraChart> ("use client"). Function
// values cannot cross the RSC Server→Client serialization boundary, so the
// wrapper has to live on the client side too. All inputs (Repo, payload
// arrays, range string) are plain serializable data.

import Link from "next/link";

import { AuroraChart, AURORA, compactNumber, shortDate } from "@/components/charts/AuroraChart";
import { Icon } from "@/components/icon/Icon";
import type { Repo } from "@/lib/types";
import type { StarActivityPayload } from "@/lib/star-activity";
import type { DailyDownload } from "@/lib/npm-daily";

export type ChartRange = "1m" | "3m" | "6m" | "1y" | "all";

export const CHART_RANGES: readonly ChartRange[] = ["1m", "3m", "6m", "1y", "all"] as const;

const RANGE_DAYS: Record<ChartRange, number | null> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  all: null,
};

const RANGE_LABEL: Record<ChartRange, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  all: "ALL",
};

interface ChartEvent {
  /** ISO YYYY-MM-DD (preferred) OR 0..1 fractional position along the x axis
   *  (kept for back-compat with the pre-Aurora call sites). Numeric forms
   *  fall back to a relative-position rendering inside the wrapper card —
   *  marker lines on the new Recharts canvas only resolve from real dates. */
  x: string | number;
  /** 0..1 from top of plot area — used by the legacy card footer position. */
  y: number;
  label: string;
  color: string;
  url?: string;
}

interface StarHistoryChartProps {
  repo: Repo;
  starActivity?: StarActivityPayload | null;
  npmDaily?: DailyDownload[] | null;
  npmPackage?: string | null;
  events?: ChartEvent[];
  range: ChartRange;
}

interface DataPoint {
  d: string;
  stars: number | null;
  npm: number | null;
}

function parseDayMs(day: string): number {
  return Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  );
}

function todayUtcMs(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function rangeHref(range: ChartRange): string {
  return range === "1y" ? "?" : `?range=${range}`;
}

export function StarHistoryChart({
  repo,
  starActivity,
  npmDaily,
  npmPackage,
  events = [],
  range,
}: StarHistoryChartProps) {
  // Window selection — only points inside the user's range slice.
  const days = RANGE_DAYS[range];
  const cutoffMs = days === null ? -Infinity : Date.now() - days * 86_400_000;

  // Star points within window, with optional downsampling so the SVG stays
  // light at large windows.
  const rawStars = (starActivity?.points ?? []).filter(
    (p) => parseDayMs(p.d) >= cutoffMs,
  );
  const starPoints = (() => {
    if (rawStars.length <= 80) return rawStars;
    const step = Math.ceil(rawStars.length / 80);
    return rawStars.filter((_, i) => i % step === 0);
  })();

  // Fallback: 30d OSS-Insight sparkline baked into the trending payload when
  // backfill hasn't landed yet. Synthesize dates ending today.
  const sparklineUsed =
    starPoints.length < 2 &&
    Array.isArray(repo.sparklineData) &&
    repo.sparklineData.length > 1;

  const seededStars: Array<{ d: string; s: number }> = sparklineUsed
    ? (() => {
        const len = repo.sparklineData!.length;
        const today = todayUtcMs();
        return repo.sparklineData!.map((s, i) => {
          const ms = today - (len - 1 - i) * 86_400_000;
          const dt = new Date(ms);
          const d = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
          return { d, s };
        });
      })()
    : starPoints.map((p) => ({ d: p.d, s: p.s }));

  // Merge stars + npm-downloads onto the same daily timeline so Recharts can
  // walk a single data array (one entry per UTC day).
  const npmByDay = new Map<string, number>();
  for (const p of npmDaily ?? []) {
    if (parseDayMs(p.date) >= cutoffMs) {
      npmByDay.set(p.date, p.downloads);
    }
  }
  const data: DataPoint[] = seededStars.map(({ d, s }) => ({
    d,
    stars: s,
    npm: npmByDay.get(d) ?? null,
  }));

  // Pull any npm-only days that didn't have a matching star bucket. Rare,
  // but keeps the overlay continuous on edges of the window.
  for (const [day, downloads] of npmByDay) {
    if (!seededStars.find((p) => p.d === day)) {
      data.push({ d: day, stars: null, npm: downloads });
    }
  }
  data.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  const hasStarData = seededStars.length > 1;
  const hasNpm = (npmDaily ?? []).length > 1;

  // Convert events into Aurora markers — only the ones whose `x` field is a
  // real date string survive (numeric/fractional ones can't anchor to a
  // categorical x-axis cleanly).
  const markers = events
    .filter((e) => typeof e.x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.x))
    .map((e) => ({
      x: e.x as string,
      label: e.label,
      color: e.color,
    }));

  return (
    <div className="hero-chart-wrap">
      <div className="hero-chart-head">
        <h2 className="hero-chart-title">
          ▌ <b>Star history</b> · {RANGE_LABEL[range]}
          {sparklineUsed
            ? " · 30d OSS-Insight fallback while stargazer backfill warms"
            : hasNpm && npmPackage
              ? ` · annotated with releases + ${npmPackage} downloads`
              : " · annotated with releases + mention events"}
        </h2>
        <div className="grow" />
        <div className="legend-row">
          <span className="lg">
            <span className="lg-sw" style={{ background: AURORA.lead }} /> Stars
          </span>
          {hasNpm ? (
            <span className="lg">
              <span className="lg-sw" style={{ background: AURORA.secondary }} />{" "}
              NPM downloads
            </span>
          ) : null}
          {events.length > 0 ? (
            <span className="lg">
              <span
                className="lg-sw"
                style={{
                  background: "var(--info)",
                  height: 8,
                  width: 8,
                  borderRadius: "50%",
                }}
              />{" "}
              Events
            </span>
          ) : null}
        </div>
        <div className="segmented" aria-label="Star history time range">
          {CHART_RANGES.map((r) => (
            <Link
              key={r}
              href={rangeHref(r)}
              prefetch={false}
              scroll={false}
              className={r === range ? "on" : ""}
              aria-current={r === range ? "true" : undefined}
            >
              {RANGE_LABEL[r]}
            </Link>
          ))}
        </div>
      </div>
      <div className="hero-chart-body">
        {hasStarData ? (
          <AuroraChart
            data={data}
            xKey="d"
            variant={hasNpm ? "dualArea" : "area"}
            height={280}
            series={
              hasNpm
                ? [
                    { dataKey: "stars", name: "Stars" },
                    { dataKey: "npm", name: "NPM/day", rightAxis: true, color: AURORA.secondary },
                  ]
                : [{ dataKey: "stars", name: "Stars" }]
            }
            markers={markers}
            yFormatter={compactNumber}
            xFormatter={shortDate}
            tooltipFormatter={compactNumber}
            ariaLabel={`${repo.fullName} star history`}
          />
        ) : (
          <div className="chart-empty" role="status">
            <div className="chart-empty-mark">
              <Icon name="flag" size={14} />
            </div>
            <div>
              <div className="chart-empty-title">Star history warming</div>
              <div className="chart-empty-sub">
                The stargazer backfill for {repo.fullName} is still being walked.
                A timeline appears here as soon as ≥ 2 days of activity have been
                indexed.
              </div>
            </div>
          </div>
        )}
      </div>

      {events.length > 0 ? (
        <div className="hero-chart-foot">
          {events.slice(0, 4).map((e, i) => (
            <div key={`evcard-${i}-${e.label}`} className="event-card">
              <div
                className="event-mark"
                style={{
                  background: e.color,
                  color: "var(--surface)",
                }}
              >
                <Icon name="flag" size={11} />
              </div>
              <div>
                <div className="event-title">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer noopener">
                      {e.label}
                    </a>
                  ) : (
                    e.label
                  )}
                </div>
                <div className="event-meta">
                  event marker
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type { ChartEvent };
