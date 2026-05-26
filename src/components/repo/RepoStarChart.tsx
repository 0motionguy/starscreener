"use client";

// RepoStarChart — interactive star-history card on /repo/[owner]/[name].
//
// Standalone-profile rebuild (Agent 6 · 2026-05-25):
//   The card chrome now matches `PFCharts` in `Profile - standalone.html`:
//     - `pf-card pf-chart-card` outer card
//     - `pf-card-head` with `<h3>// STAR HISTORY · 12M</h3>` slash-tag title
//     - Right side: "+N all-time-window" success-coloured pill + `pf-chart-tabs`
//       (1M / 3M / 6M / 1Y / ALL) — a real <button> group with arrow-key nav,
//       `aria-pressed`, and `role="tablist"` semantics (impeccable §a11y).
//     - `pf-chart-body` containing the canvas + `pf-chart-legend` swatch row.
//
// Renderer reuse:
//   The previous component shipped Chart.js (`react-chartjs-2`) — Agent 6's
//   brief says "keep the existing renderer; only change the wrapping chrome".
//   So the Chart.js config, plugins, and dataset assembly are preserved
//   verbatim — only the surrounding markup changes. The URL-driven
//   range/scale/theme controls move from <Link> elements into the new
//   button-driven tabs (range only — scale/theme stay in the URL via
//   the existing `?range=...&scale=...&theme=...` contract, but the tab
//   group is the primary controller now and pushes range with
//   `router.push(..., { scroll: false })`).
//
// Why client component:
//   - Tab state needs immediate response + arrow-key nav (no waiting on RSC).
//   - Chart.js requires the DOM.
//   - Reduced-motion is detected via `matchMedia` and disables chart animation
//     (Chart.js `animation: false`) for users who request it.

import { useMemo, useRef, useState, useEffect, useCallback, type ReactElement } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Icon } from "@/components/icon/Icon";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

import {
  filterPayloadByWindow,
  type StarActivityPayload,
  type StarActivityWindow,
} from "@/lib/star-activity";
import type { DailyDownload } from "@/lib/npm-daily";
import type { Repo } from "@/lib/types";

// Idempotent global Chart.js registration.
ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// ---------------------------------------------------------------------------
// Public types — page.tsx contract is unchanged.
// ---------------------------------------------------------------------------

export type ChartRange = "1m" | "3m" | "6m" | "1y" | "all";
export type ChartScale = "lin" | "log";
export type ChartTheme = "aurora" | "macarons" | "vintage" | "dark";

export interface MentionMarker {
  ts: string;
  source: string;
  title: string;
  url: string;
}

export interface ReleaseMarker {
  ts: string;
  tag: string;
  url: string;
}

interface RepoStarChartProps {
  repo: Repo;
  starActivity: StarActivityPayload | null;
  npmDaily: DailyDownload[];
  npmPackage: string | null;
  commitsLast52Weeks: number[];
  releases: ReleaseMarker[];
  mentions: MentionMarker[];
  range: ChartRange;
  scale: ChartScale;
}

// ---------------------------------------------------------------------------
// Tab + window mapping
// ---------------------------------------------------------------------------

const RANGE_OPTIONS: ReadonlyArray<{ id: ChartRange; label: string }> = [
  { id: "1m", label: "1M" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "ALL" },
];

const DEFAULT_RANGE: ChartRange = "1y";

const RANGE_TO_WINDOW: Record<ChartRange, StarActivityWindow> = {
  "1m": "30d",
  "3m": "90d",
  "6m": "6m",
  "1y": "1y",
  all: "all",
};

// ---------------------------------------------------------------------------
// Theme palettes — kept in sync with the rest of the design system.
// ---------------------------------------------------------------------------

interface ThemePalette {
  stars: string;
  starsFill: string;
  npm: string;
  commits: string;
  release: string;
  mention: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipFg: string;
}

const THEMES: Record<ChartTheme, ThemePalette> = {
  aurora: {
    stars: "rgba(255, 107, 53, 1)",
    starsFill: "rgba(255, 107, 53, 0.15)",
    npm: "rgba(125, 211, 252, 0.95)",
    commits: "rgba(148, 163, 184, 0.28)",
    release: "rgba(34, 197, 94, 1)",
    mention: "rgba(96, 165, 250, 1)",
    grid: "rgba(255, 255, 255, 0.05)",
    axis: "rgba(180, 188, 200, 0.7)",
    tooltipBg: "rgba(11, 16, 25, 0.96)",
    tooltipFg: "rgba(238, 240, 242, 1)",
  },
  macarons: {
    stars: "rgba(244, 114, 182, 1)",
    starsFill: "rgba(244, 114, 182, 0.18)",
    npm: "rgba(167, 139, 250, 0.95)",
    commits: "rgba(244, 114, 182, 0.22)",
    release: "rgba(125, 211, 252, 1)",
    mention: "rgba(255, 210, 77, 1)",
    grid: "rgba(255, 255, 255, 0.06)",
    axis: "rgba(180, 188, 200, 0.7)",
    tooltipBg: "rgba(28, 18, 32, 0.96)",
    tooltipFg: "rgba(255, 245, 250, 1)",
  },
  vintage: {
    stars: "rgba(255, 181, 71, 1)",
    starsFill: "rgba(255, 181, 71, 0.18)",
    npm: "rgba(217, 119, 6, 0.9)",
    commits: "rgba(202, 138, 4, 0.22)",
    release: "rgba(120, 113, 108, 1)",
    mention: "rgba(67, 56, 202, 1)",
    grid: "rgba(112, 96, 64, 0.18)",
    axis: "rgba(120, 105, 80, 0.85)",
    tooltipBg: "rgba(28, 22, 12, 0.96)",
    tooltipFg: "rgba(252, 244, 220, 1)",
  },
  dark: {
    stars: "rgba(125, 211, 252, 1)",
    starsFill: "rgba(125, 211, 252, 0.14)",
    npm: "rgba(34, 197, 94, 0.92)",
    commits: "rgba(148, 163, 184, 0.18)",
    release: "rgba(255, 210, 77, 1)",
    mention: "rgba(167, 139, 250, 1)",
    grid: "rgba(255, 255, 255, 0.04)",
    axis: "rgba(144, 156, 170, 0.85)",
    tooltipBg: "rgba(5, 8, 13, 0.97)",
    tooltipFg: "rgba(238, 240, 242, 1)",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

function parseDayMs(d: string): number {
  return Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)) - 1,
    Number(d.slice(8, 10)),
  );
}

// Map the 52-week commit cadence onto absolute timestamps (oldest-first).
function commitWeekTimestamps(weeks: number[]): { x: number; y: number }[] {
  if (weeks.length === 0) return [];
  const now = Date.now();
  const startOfThisWeek = now - 7 * 86_400_000;
  return weeks.map((y, i) => {
    const weeksAgo = weeks.length - 1 - i;
    return { x: startOfThisWeek - weeksAgo * 7 * 86_400_000, y };
  });
}

function inferThemeFromUrl(): ChartTheme {
  if (typeof window === "undefined") return "aurora";
  const value = new URLSearchParams(window.location.search).get("theme");
  if (value === "macarons" || value === "vintage" || value === "dark") return value;
  return "aurora";
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RepoStarChart(props: RepoStarChartProps): ReactElement {
  const {
    repo,
    starActivity,
    npmDaily,
    npmPackage,
    commitsLast52Weeks,
    releases,
    mentions,
    range: rangeProp,
    scale,
  } = props;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local optimistic state so the tab group responds instantly; URL
  // updates in parallel so the choice is shareable / restorable.
  const [range, setRange] = useState<ChartRange>(rangeProp);
  useEffect(() => setRange(rangeProp), [rangeProp]);

  const theme: ChartTheme = useMemo(() => inferThemeFromUrl(), []);
  const palette = THEMES[theme];
  const reducedMotion = usePrefersReducedMotion();

  // Window filtering — single source of truth.
  const windowed = useMemo(() => {
    if (!starActivity) return null;
    return filterPayloadByWindow(starActivity, RANGE_TO_WINDOW[range]);
  }, [starActivity, range]);

  // x-axis bounds
  const xMinMs = useMemo(() => {
    if (windowed && windowed.points.length > 0) {
      return parseDayMs(windowed.points[0].d);
    }
    const days =
      range === "1m" ? 30 :
      range === "3m" ? 90 :
      range === "6m" ? 180 :
      range === "1y" ? 365 : 365 * 3;
    return Date.now() - days * 86_400_000;
  }, [windowed, range]);
  const xMaxMs = useMemo(() => {
    if (windowed && windowed.points.length > 0) {
      return parseDayMs(windowed.points[windowed.points.length - 1].d);
    }
    return Date.now();
  }, [windowed]);

  const starPoints = useMemo(() => {
    const pts = (windowed?.points ?? []).map((p) => ({
      x: parseDayMs(p.d),
      y: p.s,
    }));
    if (pts.length <= 120) return pts;
    const step = Math.ceil(pts.length / 120);
    return pts.filter((_, i) => i % step === 0);
  }, [windowed]);

  const npmPoints = useMemo(() => {
    if (npmDaily.length === 0) return [];
    return npmDaily
      .map((p) => ({ x: parseDayMs(p.date), y: p.downloads }))
      .filter((p) => p.x >= xMinMs && p.x <= xMaxMs);
  }, [npmDaily, xMinMs, xMaxMs]);

  const commitPoints = useMemo(() => {
    const pts = commitWeekTimestamps(commitsLast52Weeks);
    return pts.filter((p) => p.x >= xMinMs && p.x <= xMaxMs);
  }, [commitsLast52Weeks, xMinMs, xMaxMs]);

  const starByDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of starPoints) m.set(p.x, p.y);
    return m;
  }, [starPoints]);

  const nearestStar = useCallback((ts: number): number | null => {
    if (starByDay.size === 0) return null;
    if (starByDay.has(ts)) return starByDay.get(ts)!;
    let nearest: { dx: number; y: number } | null = null;
    for (const [x, y] of starByDay) {
      const dx = Math.abs(x - ts);
      if (nearest === null || dx < nearest.dx) nearest = { dx, y };
    }
    return nearest ? nearest.y : null;
  }, [starByDay]);

  const releasePoints = useMemo(() => {
    return releases
      .map((r) => ({ ts: Date.parse(r.ts), tag: r.tag, url: r.url }))
      .filter((r) => Number.isFinite(r.ts) && r.ts >= xMinMs && r.ts <= xMaxMs)
      .map((r) => ({
        x: r.ts,
        y: nearestStar(r.ts) ?? 0,
        _label: r.tag,
        _kind: "release" as const,
        _url: r.url,
      }));
  }, [releases, xMinMs, xMaxMs, nearestStar]);

  const mentionPoints = useMemo(() => {
    return mentions
      .map((m) => ({ ts: Date.parse(m.ts), title: m.title, source: m.source, url: m.url }))
      .filter((m) => Number.isFinite(m.ts) && m.ts >= xMinMs && m.ts <= xMaxMs)
      .map((m) => ({
        x: m.ts,
        y: nearestStar(m.ts) ?? 0,
        _label: `${m.source.toUpperCase()} · ${m.title}`,
        _kind: "mention" as const,
        _url: m.url,
      }));
  }, [mentions, xMinMs, xMaxMs, nearestStar]);

  type AnyPoint = { x: number; y: number };

  const datasets = useMemo(() => {
    const out: ChartData<"line" | "bar", AnyPoint[]>["datasets"] = [];

    if (commitPoints.length > 0) {
      out.push({
        type: "bar" as const,
        label: "Commits / week",
        data: commitPoints,
        backgroundColor: palette.commits,
        borderColor: palette.commits,
        yAxisID: "y2",
        order: 3,
        barThickness: "flex" as const,
        maxBarThickness: 18,
      });
    }

    out.push({
      type: "line" as const,
      label: "Stars",
      data: starPoints,
      borderColor: palette.stars,
      backgroundColor: palette.starsFill,
      borderWidth: 2.4,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: palette.stars,
      pointHoverBorderColor: "#eef0f2",
      pointHoverBorderWidth: 2,
      tension: 0.34,
      fill: "origin",
      yAxisID: "y",
      order: 2,
      spanGaps: true,
    });

    if (npmPoints.length > 0) {
      out.push({
        type: "line" as const,
        label: npmPackage ? `${npmPackage} downloads` : "NPM downloads",
        data: npmPoints,
        borderColor: palette.npm,
        backgroundColor: "transparent",
        borderWidth: 1.6,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: palette.npm,
        pointHoverBorderColor: "#eef0f2",
        pointHoverBorderWidth: 2,
        tension: 0.34,
        yAxisID: "y2",
        order: 1,
        spanGaps: true,
      });
    }

    if (releasePoints.length > 0) {
      out.push({
        type: "line" as const,
        label: "Releases",
        data: releasePoints,
        showLine: false,
        borderColor: palette.release,
        backgroundColor: palette.release,
        pointStyle: "triangle" as const,
        pointRadius: 7,
        pointHoverRadius: 9,
        pointBorderColor: "#eef0f2",
        pointBorderWidth: 1.5,
        yAxisID: "y",
        order: 0,
      });
    }

    if (mentionPoints.length > 0) {
      out.push({
        type: "line" as const,
        label: "Mentions",
        data: mentionPoints,
        showLine: false,
        borderColor: palette.mention,
        backgroundColor: palette.mention,
        pointStyle: "circle" as const,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBorderColor: "#eef0f2",
        pointBorderWidth: 1.5,
        yAxisID: "y",
        order: 0,
      });
    }

    return out;
  }, [
    palette,
    starPoints,
    npmPoints,
    npmPackage,
    commitPoints,
    releasePoints,
    mentionPoints,
  ]);

  type MarkerPoint = AnyPoint & {
    _kind?: "release" | "mention";
    _label?: string;
    _url?: string;
  };

  const options: ChartOptions<"line" | "bar"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion ? false : { duration: 600, easing: "easeOutCubic" },
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: palette.tooltipBg,
          titleColor: palette.tooltipFg,
          bodyColor: palette.tooltipFg,
          borderColor: "rgba(255, 255, 255, 0.06)",
          borderWidth: 1,
          padding: 12,
          titleFont: { family: "var(--font-mono)", size: 11 },
          bodyFont: { family: "var(--font-sans)", size: 12 },
          callbacks: {
            title: (ctx) => {
              const ts = ctx[0]?.parsed.x;
              if (typeof ts !== "number") return "";
              return new Date(ts).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              });
            },
            label: (ctx) => {
              const raw = ctx.raw as MarkerPoint;
              const dsLabel = ctx.dataset.label ?? "";
              if (raw && raw._kind === "release") return `▲ Release · ${raw._label}`;
              if (raw && raw._kind === "mention") return `● ${raw._label}`;
              const val = ctx.parsed.y;
              if (val === null || val === undefined) return `${dsLabel}: —`;
              if (dsLabel.includes("Stars")) return `${dsLabel}: ${fmtStars(val)}`;
              if (dsLabel.includes("downloads")) return `${dsLabel}: ${fmtStars(val)}/day`;
              if (dsLabel.includes("Commits")) return `${dsLabel}: ${val.toLocaleString("en-US")}`;
              return `${dsLabel}: ${val}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time" as const,
          time: {
            tooltipFormat: "MMM d, yyyy",
            displayFormats: { day: "MMM d", week: "MMM d", month: "MMM yyyy" },
          },
          grid: { color: palette.grid, display: true },
          border: { display: false },
          ticks: {
            color: palette.axis,
            font: { family: "var(--font-mono)", size: 10 },
            maxRotation: 0,
            autoSkipPadding: 24,
          },
        },
        y: {
          type: scale === "log" ? ("logarithmic" as const) : ("linear" as const),
          position: "left" as const,
          grid: { color: palette.grid, display: true },
          border: { display: false },
          ticks: {
            color: palette.axis,
            font: { family: "var(--font-mono)", size: 10 },
            callback: (v) => fmtStars(typeof v === "string" ? Number(v) : v),
          },
        },
        y2: {
          type: "linear" as const,
          position: "right" as const,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: palette.axis,
            font: { family: "var(--font-mono)", size: 10 },
            callback: (v) => fmtStars(typeof v === "string" ? Number(v) : v),
          },
        },
      },
    }),
    [palette, scale, reducedMotion],
  );

  // Click-through plugin — open release/mention URLs on point click.
  const clickPlugin: Plugin<"line" | "bar"> = useMemo(
    () => ({
      id: "repo-marker-click",
      afterEvent: (chart, args) => {
        if (args.event.type !== "click") return;
        const ev = args.event;
        if (typeof ev.x !== "number" || typeof ev.y !== "number") return;
        const els = chart.getElementsAtEventForMode(
          ev as unknown as Event,
          "nearest",
          { intersect: true },
          true,
        );
        for (const el of els) {
          const ds = chart.data.datasets[el.datasetIndex];
          if (!ds) continue;
          const point = (ds.data?.[el.index] as unknown) as MarkerPoint | undefined;
          if (point && point._url) {
            if (typeof window !== "undefined") {
              window.open(point._url, "_blank", "noopener,noreferrer");
            }
            return;
          }
        }
      },
    }),
    [],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);

  // ---------- All-time-window total + "today" pin ----------
  const totalGain = useMemo(() => {
    const pts = windowed?.points ?? [];
    if (pts.length < 2) return 0;
    return pts[pts.length - 1].s - pts[0].s;
  }, [windowed]);

  const today = useMemo(() => {
    const pts = starActivity?.points ?? [];
    if (pts.length === 0) return repo.stars;
    return pts[pts.length - 1].s;
  }, [starActivity, repo.stars]);

  const hasStarData = starPoints.length > 1;

  // ---------- Tab interaction: arrow-key nav + URL push ----------
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const pushRange = useCallback(
    (next: ChartRange) => {
      setRange(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === DEFAULT_RANGE) params.delete("range");
      else params.set("range", next);
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      let next = idx;
      if (e.key === "ArrowRight") next = (idx + 1) % RANGE_OPTIONS.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = RANGE_OPTIONS.length - 1;
      const target = RANGE_OPTIONS[next];
      tabRefs.current[next]?.focus();
      pushRange(target.id);
    },
    [pushRange],
  );

  // ---------- Render ----------

  return (
    <div className="pf-card pf-chart-card">
      <div className="pf-card-head">
        <h3>
          <span className="slash">{"//"}</span>
          {"STAR HISTORY · 12M"}
        </h3>
        <div className="pf-chart-head-right">
          <span
            className="pf-chart-window-total"
            aria-label={`Net change over selected window: ${totalGain >= 0 ? "+" : ""}${totalGain.toLocaleString("en-US")} stars`}
          >
            {totalGain >= 0 ? "+" : ""}
            {totalGain.toLocaleString("en-US")} all-time-window
          </span>
          <div
            className="pf-chart-tabs"
            role="tablist"
            aria-label="Star history time range"
          >
            {RANGE_OPTIONS.map((opt, idx) => {
              const active = opt.id === range;
              return (
                <button
                  key={opt.id}
                  ref={(el) => { tabRefs.current[idx] = el; }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  className={active ? "active" : ""}
                  onClick={() => pushRange(opt.id)}
                  onKeyDown={(e) => onTabKeyDown(e, idx)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="pf-chart-body" ref={containerRef}>
        {hasStarData ? (
          <>
            <div className="pf-chart-canvas" style={{ height: 240 }}>
              <Chart
                type="line"
                data={{ datasets } as ChartData<"line" | "bar", AnyPoint[]>}
                options={options}
                plugins={[clickPlugin]}
              />
            </div>
            <div className="pf-chart-legend">
              <span>
                <span className="swatch" style={{ background: "var(--accent)" }} />
                Stars · cumulative
              </span>
              <span className="pf-chart-legend-today">
                {today.toLocaleString("en-US")} · today
              </span>
            </div>
          </>
        ) : (
          <div className="pf-chart-empty" role="status">
            <div className="pf-chart-empty-mark">
              <Icon name="flag" size={14} />
            </div>
            <div>
              <div className="pf-chart-empty-title">Star history warming</div>
              <div className="pf-chart-empty-sub">
                The stargazer backfill for {repo.fullName} is still being walked.
                A timeline appears here as soon as ≥ 2 days of activity have been
                indexed.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
