"use client";

// CompareChartGallery — multi-repo star-history workbench.
//
// Mirrors /tools/star-history exactly:
//
//   1. Controls toolbar above the chart (window + scale chips).
//   2. The same StarChart that powers star-history, rendering 1-N repos
//      as overlaid cumulative-stars lines painted by the active theme.
//   3. A ThemeLab tile gallery below the chart with the same 7 themes
//      star-history exposes via GALLERY_THEMES (sketch dropped — its
//      SVG renderer is single-series only). Each tile previews the
//      PRIMARY repo (the first in the comparison) so the user can see
//      the aesthetic before applying; clicking the tile applies the
//      theme to the multi-line chart above.

import { useEffect, useMemo, useState } from "react";

import { StarChart } from "@/components/star-history/StarChart";
import {
  RechartsTile,
  type RechartsVariant,
} from "@/components/star-history/RechartsTile";
import {
  GALLERY_THEMES,
  type PublicThemeName,
} from "@/lib/charts/public-themes";
import {
  filterPayloadByWindow,
  type StarActivityPayload,
  type StarActivityScale,
  type StarActivityWindow,
} from "@/lib/star-activity-shared";
import type { Repo } from "@/lib/types";

// The themes star-history's ThemeLab exposes, minus `sketch` (custom SVG
// renderer that only paints a single repo — incompatible with multi-line
// compare). 7 ECharts-backed themes painted by <StarChart>.
const COMPARE_THEMES = GALLERY_THEMES.filter(
  (t): t is (typeof GALLERY_THEMES)[number] & { id: PublicThemeName & RechartsVariant } =>
    t.id !== "sketch",
);

const WINDOW_OPTIONS = [
  { id: "7d",  label: "7D",       eyebrow: "7-day window" },
  { id: "30d", label: "30D",      eyebrow: "30-day window" },
  { id: "90d", label: "90D",      eyebrow: "90-day window" },
  { id: "6m",  label: "6M",       eyebrow: "6-month window" },
  { id: "1y",  label: "1Y",       eyebrow: "12-month window" },
  { id: "all", label: "LIFETIME", eyebrow: "lifetime" },
] as const satisfies ReadonlyArray<{
  id: StarActivityWindow;
  label: string;
  eyebrow: string;
}>;
type WindowOption = (typeof WINDOW_OPTIONS)[number];
const DEFAULT_WINDOW: WindowOption = WINDOW_OPTIONS[5]; // lifetime

const SCALE_OPTIONS = [
  { id: "lin", label: "LIN" },
  { id: "log", label: "LOG" },
] as const satisfies ReadonlyArray<{ id: StarActivityScale; label: string }>;
const DEFAULT_SCALE = SCALE_OPTIONS[0];

const DEFAULT_THEME: PublicThemeName = "aurora";

// Brand-aligned legend swatches — stable across themes so the picker stays
// legible on every backdrop (same precedent as star-history's SeriesBar).
const LEGEND_SWATCH_COLORS = [
  "var(--accent, #ff6b35)",
  "var(--cyan, #3ad6c5)",
  "var(--warning, #ffb547)",
  "var(--up, #22c55e)",
  "#a78bfa",
  "#f472b6",
];

interface Props {
  repos: Repo[];
}

export function CompareChartGallery({ repos }: Props) {
  const [activeWindow, setActiveWindow] = useState<WindowOption>(DEFAULT_WINDOW);
  const [scale, setScale] = useState<StarActivityScale>(DEFAULT_SCALE.id);
  const [theme, setTheme] = useState<PublicThemeName>(DEFAULT_THEME);
  const [payloads, setPayloads] = useState<Map<string, StarActivityPayload>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  // Fetch full lifetime payloads once per repo set. Window slicing happens
  // client-side via filterPayloadByWindow so changing window is instant
  // (no refetch, no spinner).
  useEffect(() => {
    if (repos.length === 0) {
      setPayloads(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const url = new URL("/api/compare/payloads", window.location.origin);
    url.searchParams.set("repos", repos.map((r) => r.fullName).join(","));
    fetch(url.toString(), { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const next = new Map<string, StarActivityPayload>();
        const rows: Array<{ fullName: string; payload: StarActivityPayload | null }> =
          body?.rows ?? body?.payloads ?? [];
        for (const row of rows) {
          if (row.payload) next.set(row.fullName.toLowerCase(), row.payload);
        }
        setPayloads(next);
      })
      .catch(() => {
        if (!cancelled) setPayloads(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  // Build the multi-series input for StarChart. Repos with no backfilled
  // payload are skipped (they show as "queued" in the legend below the
  // chart so the user knows why their line is missing).
  const series = useMemo(() => {
    const out: Array<{ repo: Repo; name: string; payload: StarActivityPayload }> = [];
    for (const repo of repos) {
      const raw = payloads.get(repo.fullName.toLowerCase());
      if (!raw) continue;
      const filtered = filterPayloadByWindow(raw, activeWindow.id);
      if (filtered.points.length === 0) continue;
      out.push({ repo, name: repo.fullName, payload: filtered });
    }
    return out;
  }, [repos, payloads, activeWindow]);

  const hasData = series.length > 0;
  const isMulti = series.length > 1;

  // Primary repo for the ThemeLab tile previews. The tiles are aesthetic
  // previews — they show the FIRST repo to keep each tile fast and legible
  // (rendering N lines per tile × 7 tiles would be visual noise + perf).
  const primary = series[0] ?? null;

  // Sum of latest stars across all rendered series — headline number for the
  // chart-head meta strip. Mirrors star-history's "<N> stars total" pattern.
  const combinedCurrent = useMemo(() => {
    let sum = 0;
    for (const s of series) {
      const last = s.payload.points[s.payload.points.length - 1];
      if (last) sum += last.s;
    }
    return sum;
  }, [series]);

  return (
    <section aria-label="Compare chart" style={{ marginBottom: 24 }}>
      {/* Controls — sibling to the chart shell, sitting ABOVE it, just like
       * star-history. Window on the left, scale on the right, no theme
       * chips (theme lives in the tile gallery below the chart). */}
      <div className="sh-controls" role="toolbar" aria-label="Chart controls">
        <div className="seg-chip-row" role="group" aria-label="Time window">
          {WINDOW_OPTIONS.map((opt) => {
            const isOn = opt.id === activeWindow.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`seg-chip${isOn ? " on" : ""}`}
                aria-pressed={isOn}
                onClick={() => setActiveWindow(opt)}
              >
                {opt.id === "all" ? <span aria-hidden="true">★</span> : null}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grow" />

        <div className="seg-chip-row" role="group" aria-label="Y-axis scale">
          {SCALE_OPTIONS.map((opt) => {
            const isOn = opt.id === scale;
            return (
              <button
                key={opt.id}
                type="button"
                className={`seg-chip${isOn ? " on" : ""}`}
                aria-pressed={isOn}
                onClick={() => setScale(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <section
        className={`sh-chart-shell sh-art sh-art-${theme}`}
        data-theme={theme}
      >
        <div className="sh-chart-head">
          <span className="slash">{"// star activity"}</span>
          <span className="title">
            {isMulti ? `${series.length} repos` : (series[0]?.name ?? "—")}
          </span>
          <span className="meta">
            {loading ? (
              <>loading lifetime history…</>
            ) : hasData ? (
              <>
                <b>{formatCompact(combinedCurrent)}</b>{" "}
                {isMulti ? "combined stars" : "stars total"} · {activeWindow.eyebrow}
              </>
            ) : (
              <>no backfilled history yet · check back shortly</>
            )}
          </span>
        </div>

        <div className="sh-chart-body">
          {hasData ? (
            <StarChart
              themeName={theme}
              series={series.map((s) => ({ name: s.name, payload: s.payload }))}
              scale={scale}
              height={380}
              ariaLabel={`Star history for ${series.map((s) => s.name).join(", ")}`}
            />
          ) : (
            <div className="cmp-chart-empty" role="status">
              {loading
                ? "Loading lifetime history…"
                : "No backfilled history for the selected repos yet. The daily appender bootstraps newcomers on its next 03:17 UTC run."}
            </div>
          )}
        </div>
      </section>

      {/* Legend — one row per repo with stars, 7d delta, queued state. */}
      <div className="cmp-chart-legend">
        {repos.map((repo, idx) => {
          const has = payloads.get(repo.fullName.toLowerCase()) !== undefined;
          const delta = repo.starsDelta7d ?? 0;
          const deltaColor =
            delta > 0 ? "var(--up)" : delta < 0 ? "var(--down)" : "var(--fg-faint)";
          const color = LEGEND_SWATCH_COLORS[idx % LEGEND_SWATCH_COLORS.length];
          return (
            <div key={repo.fullName} className="cmp-chart-legend-row">
              <span
                className="cmp-chart-legend-swatch"
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className="cmp-chart-legend-name">{repo.fullName}</span>
              <span className="cmp-chart-legend-stars">
                ★ {formatCompact(repo.stars ?? 0)}
              </span>
              <span className="cmp-chart-legend-delta" style={{ color: deltaColor }}>
                {formatDelta(repo.starsDelta7d)} · 7d
              </span>
              {has ? null : (
                <span className="cmp-chart-legend-status" title="History backfilling">
                  queued
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Theme lab — the same tile gallery component pattern as
       * /tools/star-history. Each tile previews the PRIMARY repo in that
       * theme so the user sees the aesthetic before applying. */}
      {primary ? (
        <section className="sh-theme-lab" aria-label="Theme lab — pick a chart treatment">
          <div className="sh-theme-lab-head">
            <span
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "var(--t-control)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {"// theme lab"}
            </span>
            <span className="sh-theme-lab-hint">
              primary repo preview · <b>{COMPARE_THEMES.length}</b> treatments · click to apply
            </span>
          </div>
          <div className="sh-theme-lab-grid">
            {COMPARE_THEMES.map((t) => {
              const isActive = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  aria-pressed={isActive}
                  aria-label={`Apply ${t.label} theme`}
                  className={`sh-theme-tile sh-tt-${t.id}${isActive ? " is-active" : ""}${t.light ? " is-light" : " is-dark"}`}
                  style={{
                    appearance: "none",
                    font: "inherit",
                    textAlign: "left",
                    padding: 0,
                  }}
                >
                  <div className="sh-theme-tile-head">
                    <span
                      className="sh-theme-tile-swatch"
                      style={{ background: t.swatch }}
                      aria-hidden="true"
                    />
                    <span className="sh-theme-tile-label">{t.label}</span>
                    {isActive ? <span className="sh-theme-tile-active">ACTIVE</span> : null}
                  </div>
                  <div className="sh-theme-tile-canvas">
                    <span
                      className="sh-theme-tile-repo"
                      aria-hidden="true"
                      title={primary.name}
                    >
                      {primary.name}
                    </span>
                    <RechartsTile
                      variant={t.id}
                      payload={primary.payload}
                      uid={`cmp-tile-${t.id}`}
                    />
                  </div>
                  <div className="sh-theme-tile-foot">
                    <span className="sh-theme-tile-blurb">{t.blurb}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <style>{`
        .cmp-chart-empty {
          display: grid;
          place-items: center;
          height: 380px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--fg-muted);
          background: var(--surface-2);
          border: 1px dashed var(--border-subtle);
          border-radius: var(--r-md);
          padding: 24px;
          text-align: center;
        }
        .cmp-chart-legend {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 8px;
        }
        .cmp-chart-legend-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: var(--surface-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--r-xs);
        }
        .cmp-chart-legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex: 0 0 10px;
        }
        .cmp-chart-legend-name {
          font-family: var(--font-mono);
          font-size: 11.5px;
          color: var(--fg-bright);
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cmp-chart-legend-stars {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--accent);
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .cmp-chart-legend-delta {
          font-family: var(--font-mono);
          font-size: 11px;
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .cmp-chart-legend-status {
          font-family: var(--font-mono);
          font-size: 9.5px;
          color: var(--fg-faint);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 2px 6px;
          background: var(--surface-3);
          border-radius: var(--r-xs);
        }
      `}</style>
    </section>
  );
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return Math.round(n).toLocaleString();
}

function formatDelta(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const compact = formatCompact(Math.abs(n));
  if (n > 0) return `+${compact}`;
  if (n < 0) return `-${compact}`;
  return "0";
}
