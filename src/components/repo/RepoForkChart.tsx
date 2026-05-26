"use client";

// RepoForkChart — interactive forks-history card on /repo/[owner]/[name].
//
// Mirror of RepoStarChart's chrome (Agent 6 · 2026-05-25). Same `pf-card
// pf-chart-card` shell, same tab semantics, same legend layout. The only
// differences are the title (`// FORKS · 12M`), the lead colour (`--info`
// blue instead of `--accent` lava), the data source (`getForkActivity()`
// instead of `getStarActivity()`), and a leaner Chart.js config — no npm
// downloads / commits / release-marker overlays because fork history is
// a single-series story.
//
// Data posture:
//   Until a fork-history collector ships, `forkActivity` is `null` for
//   every repo and the chart renders the empty state ("No fork timeline
//   yet"). The component must NEVER fabricate a series — see the rule in
//   the briefing.

import { useMemo, useState, useEffect, useCallback, type ReactElement } from "react";
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
} from "chart.js";
import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

import {
  filterForkPayloadByWindow,
  type ForkActivityPayload,
  type ForkActivityWindow,
} from "@/lib/fork-activity";
import type { Repo } from "@/lib/types";

// Idempotent — RepoStarChart also registers these, but Chart.js silently
// deduplicates so we keep this self-contained.
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
// Public types
// ---------------------------------------------------------------------------

export type ForkChartRange = "1m" | "3m" | "6m" | "1y" | "all";

interface RepoForkChartProps {
  repo: Repo;
  forkActivity: ForkActivityPayload | null;
  range?: ForkChartRange;
}

// ---------------------------------------------------------------------------
// Range/window mapping — keeps the tab strip aligned with RepoStarChart.
// ---------------------------------------------------------------------------

const RANGE_OPTIONS: ReadonlyArray<{ id: ForkChartRange; label: string }> = [
  { id: "1m", label: "1M" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "ALL" },
];

const DEFAULT_RANGE: ForkChartRange = "1y";

const RANGE_TO_WINDOW: Record<ForkChartRange, ForkActivityWindow> = {
  "1m": "30d",
  "3m": "90d",
  "6m": "6m",
  "1y": "1y",
  all: "all",
};

// ---------------------------------------------------------------------------
// Palette — info blue, mirroring the standalone's `--info` token.
// ---------------------------------------------------------------------------

const PALETTE = {
  forks: "rgba(58, 164, 255, 1)",
  forksFill: "rgba(58, 164, 255, 0.18)",
  grid: "rgba(255, 255, 255, 0.05)",
  axis: "rgba(180, 188, 200, 0.7)",
  tooltipBg: "rgba(11, 16, 25, 0.96)",
  tooltipFg: "rgba(238, 240, 242, 1)",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtForks(n: number): string {
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

export function RepoForkChart(props: RepoForkChartProps): ReactElement {
  const { repo, forkActivity, range: rangeProp } = props;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<ForkChartRange>(rangeProp ?? DEFAULT_RANGE);
  useEffect(() => {
    if (rangeProp) setRange(rangeProp);
  }, [rangeProp]);

  const reducedMotion = usePrefersReducedMotion();

  // Window filtering
  const windowed = useMemo(() => {
    if (!forkActivity) return null;
    return filterForkPayloadByWindow(forkActivity, RANGE_TO_WINDOW[range]);
  }, [forkActivity, range]);

  const forkPoints = useMemo(() => {
    const pts = (windowed?.points ?? []).map((p) => ({
      x: parseDayMs(p.d),
      y: p.f,
    }));
    if (pts.length <= 120) return pts;
    const step = Math.ceil(pts.length / 120);
    return pts.filter((_, i) => i % step === 0);
  }, [windowed]);

  type AnyPoint = { x: number; y: number };

  const datasets = useMemo(() => {
    const out: ChartData<"line", AnyPoint[]>["datasets"] = [];
    out.push({
      type: "line" as const,
      label: "Forks",
      data: forkPoints,
      borderColor: PALETTE.forks,
      backgroundColor: PALETTE.forksFill,
      borderWidth: 2.4,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: PALETTE.forks,
      pointHoverBorderColor: "#eef0f2",
      pointHoverBorderWidth: 2,
      tension: 0.34,
      fill: "origin",
      spanGaps: true,
    });
    return out;
  }, [forkPoints]);

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion ? false : { duration: 600, easing: "easeOutCubic" },
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: PALETTE.tooltipBg,
          titleColor: PALETTE.tooltipFg,
          bodyColor: PALETTE.tooltipFg,
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
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return "Forks: —";
              return `Forks: ${fmtForks(v)}`;
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
          grid: { color: PALETTE.grid, display: true },
          border: { display: false },
          ticks: {
            color: PALETTE.axis,
            font: { family: "var(--font-mono)", size: 10 },
            maxRotation: 0,
            autoSkipPadding: 24,
          },
        },
        y: {
          type: "linear" as const,
          position: "left" as const,
          grid: { color: PALETTE.grid, display: true },
          border: { display: false },
          ticks: {
            color: PALETTE.axis,
            font: { family: "var(--font-mono)", size: 10 },
            callback: (v) => fmtForks(typeof v === "string" ? Number(v) : v),
          },
        },
      },
    }),
    [reducedMotion],
  );

  // ---------- Window total + "today" pin ----------
  const totalGain = useMemo(() => {
    const pts = windowed?.points ?? [];
    if (pts.length < 2) return 0;
    return pts[pts.length - 1].f - pts[0].f;
  }, [windowed]);

  const today = useMemo(() => {
    const pts = forkActivity?.points ?? [];
    if (pts.length === 0) return repo.forks;
    return pts[pts.length - 1].f;
  }, [forkActivity, repo.forks]);

  const hasForkData = forkPoints.length > 1;

  // ---------- Tab interaction ----------
  const tabRefs = useMemo<Array<HTMLButtonElement | null>>(() => [], []);

  const pushRange = useCallback(
    (next: ForkChartRange) => {
      setRange(next);
      // Forks reuse the shared `?range=...` param so the two charts stay in
      // sync when one is changed. If we ever want independent windows the
      // param can be split into `?starRange` / `?forkRange`.
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
      tabRefs[next]?.focus();
      pushRange(target.id);
    },
    [pushRange, tabRefs],
  );

  return (
    <div className="pf-card pf-chart-card">
      <div className="pf-card-head">
        <h3>
          <span className="slash">{"//"}</span>
          {"FORKS · 12M"}
        </h3>
        <div className="pf-chart-head-right">
          <span
            className="pf-chart-window-total"
            aria-label={`Net change over selected window: ${totalGain >= 0 ? "+" : ""}${totalGain.toLocaleString("en-US")} forks`}
          >
            {totalGain >= 0 ? "+" : ""}
            {totalGain.toLocaleString("en-US")} all-time-window
          </span>
          <div
            className="pf-chart-tabs"
            role="tablist"
            aria-label="Forks time range"
          >
            {RANGE_OPTIONS.map((opt, idx) => {
              const active = opt.id === range;
              return (
                <button
                  key={opt.id}
                  ref={(el) => { tabRefs[idx] = el; }}
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
      <div className="pf-chart-body">
        {hasForkData ? (
          <>
            <div className="pf-chart-canvas" style={{ height: 240 }}>
              <Chart
                type="line"
                data={{ datasets } as ChartData<"line", AnyPoint[]>}
                options={options}
              />
            </div>
            <div className="pf-chart-legend">
              <span>
                <span className="swatch" style={{ background: "var(--info)" }} />
                Forks · cumulative
              </span>
              <span className="pf-chart-legend-today">
                {today.toLocaleString("en-US")} · today
              </span>
            </div>
          </>
        ) : (
          <div className="pf-chart-empty" role="status">
            <div className="pf-chart-empty-mark">
              <Icon name="fork" size={14} />
            </div>
            <div>
              <div className="pf-chart-empty-title">No fork timeline yet</div>
              <div className="pf-chart-empty-sub">
                Daily fork-count snapshots for {repo.fullName} aren&apos;t being
                collected yet. The chart appears here as soon as the
                <code> fork-activity:</code> cron lands. Today&apos;s total is{" "}
                <b>{repo.forks.toLocaleString("en-US")}</b> forks.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
