"use client";

// VolumeAreaChart — source-volume chart for /market-signals.
// Must be a Client Component because it passes function props into
// <AuroraChart>, which is itself "use client".
//
// HONEST DATA CONTRACT (two modes, zero fabricated shapes):
//  - DAILY MODE (2+ diffed days available): stacked bands are REAL per-day
//    NEW mentions from the `mentions-daily` worker snapshots, diffed
//    cumulative→daily in src/lib/mentions-daily.ts. GitHub is star-velocity,
//    not a mention bucket — it stays in the source rail / fallback view and
//    out of the mention bands (it also drowned everything at linear scale).
//  - FALLBACK MODE (<2 snapshots yet): log-scaled TODAY bars with exact
//    labels. This replaces the old fake flat total/30 "time series" — a bar
//    that says "today" is honest; a 30-day area invented from one number
//    is not.

import {
  AuroraChart,
  type AuroraSeries,
} from "@/components/charts/AuroraChart";

/**
 * Wire shape for real per-day new mentions. Mirrors DailyVolumePoint in
 * src/lib/mentions-daily.ts — that module is `server-only`, so this client
 * chart declares its own structural copy.
 */
export interface DailyVolumePointWire {
  date: string; // YYYY-MM-DD (UTC)
  hackernews: number;
  twitter: number;
  bluesky: number;
  devto: number;
  lobsters: number;
}

interface VolumeAreaChartProps {
  totals: {
    github: number;
    x: number;
    hn: number;
    bsky: number;
    devto: number;
  };
  /** Real diffed per-day series; empty until 2+ worker snapshots exist. */
  daily?: DailyVolumePointWire[];
}

// Layer order matters — first = bottom of the stack. Source-brand colours so
// the legend chips stay readable inside the Aurora palette framework.
const DAILY_LAYERS = [
  { key: "hackernews", label: "HN", color: "#ff6600" },
  { key: "devto", label: "Dev.to", color: "#fff5b1" },
  { key: "lobsters", label: "Lobsters", color: "#cc4b3f" },
  { key: "bluesky", label: "Bluesky", color: "#1185fe" },
  { key: "twitter", label: "X", color: "#ffffff" },
] as const;
type DailyKey = (typeof DAILY_LAYERS)[number]["key"];

const FALLBACK_BARS = [
  { key: "github", label: "GitHub", color: "#8b5cf6" },
  { key: "x", label: "X", color: "#ffffff" },
  { key: "hn", label: "HN", color: "#ff6600" },
  { key: "bsky", label: "Bluesky", color: "#1185fe" },
  { key: "devto", label: "Dev.to", color: "#fff5b1" },
] as const;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

/** YYYY-MM-DD → MM-DD for axis labels. */
function shortDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(5, 10) : iso;
}

function LegendRow({
  entries,
  totalLabel,
  note,
}: {
  entries: Array<{ key: string; label: string; color: string; value: number }>;
  totalLabel: string;
  note?: string;
}) {
  return (
    <div
      className="row gap-4"
      style={{
        padding: "8px 16px 14px",
        borderTop: "1px solid var(--border-subtle)",
        flexWrap: "wrap",
      }}
    >
      {entries.map((entry) => (
        <span
          key={entry.key}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--fg-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ width: 10, height: 10, background: entry.color }} />
          {entry.label}{" "}
          <b style={{ color: "var(--fg)" }}>{formatCompact(entry.value)}</b>
        </span>
      ))}
      {note && (
        <span className="faint" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
          {note}
        </span>
      )}
      <span className="grow" />
      <span className="faint" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
        {totalLabel}
      </span>
    </div>
  );
}

function QuietOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--fg-faint)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        zIndex: 1,
      }}
    >
      Pipe quiet · no mentions in window
    </div>
  );
}

/** DAILY MODE — real per-day new-mention bands. */
function DailyStackedChart({ points }: { points: DailyVolumePointWire[] }) {
  type Row = { day: string } & Record<DailyKey, number>;
  const data: Row[] = points.map((p) => ({
    day: shortDate(p.date),
    hackernews: p.hackernews,
    devto: p.devto,
    lobsters: p.lobsters,
    bluesky: p.bluesky,
    twitter: p.twitter,
  }));

  const series: AuroraSeries[] = DAILY_LAYERS.map((layer) => ({
    dataKey: layer.key,
    name: layer.label,
    color: layer.color,
  }));

  const sums = { hackernews: 0, devto: 0, lobsters: 0, bluesky: 0, twitter: 0 } as Record<DailyKey, number>;
  for (const p of points) for (const layer of DAILY_LAYERS) sums[layer.key] += p[layer.key];
  const totalAll = Object.values(sums).reduce((a, b) => a + b, 0);

  return (
    <div className="card cockpit-wide">
      <div className="card-head">
        <h2 className="card-title">
          <b>Mention volume</b> · new mentions/day · stacked by source
        </h2>
        <span className="grow" />
        <span
          className="chip up"
          title="Per-day NEW mentions, diffed from the mentions-daily worker's cumulative daily snapshots. Real buckets — no distribution assumptions."
        >
          daily buckets live · {points.length}d
        </span>
      </div>

      <div className="vol-chart" style={{ position: "relative", padding: "8px 14px" }}>
        {totalAll === 0 && <QuietOverlay />}
        <AuroraChart
          data={data}
          xKey="day"
          variant="stacked"
          height={220}
          series={series}
          yFormatter={formatCompact}
          tooltipFormatter={formatCompact}
          xFormatter={(v) => String(v)}
          tooltipLabelFormatter={(v) => String(v)}
          ariaLabel={`${points.length}-day stacked new-mention volume by source`}
        />
      </div>

      <LegendRow
        entries={DAILY_LAYERS.slice()
          .reverse()
          .map((layer) => ({ ...layer, value: sums[layer.key] }))}
        totalLabel={`${formatCompact(totalAll)} total · ${points.length}d`}
        note="GitHub = ★ velocity · source rail"
      />
    </div>
  );
}

/** FALLBACK MODE — honest log-scaled today-bars until 2+ snapshots exist. */
function TotalsFallbackBars({ totals }: { totals: VolumeAreaChartProps["totals"] }) {
  const bars = FALLBACK_BARS.map((bar) => ({ ...bar, value: Math.max(0, totals[bar.key]) })).sort(
    (a, b) => b.value - a.value,
  );
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
  const widthPct = (v: number): number => {
    if (max <= 0 || v <= 0) return 0;
    return Math.max(2, (Math.log10(1 + v) / Math.log10(1 + max)) * 100);
  };
  const totalAll = bars.reduce((sum, b) => sum + b.value, 0);

  return (
    <div className="card cockpit-wide">
      <div className="card-head">
        <h2 className="card-title">
          <b>Mention volume</b> · 24h totals by source
        </h2>
        <span className="grow" />
        <span
          className="chip"
          title="Fewer than 2 daily snapshots collected so far. Bars show live 24h totals on a LOG scale (exact values labelled) so small sources stay visible next to GitHub. The stacked per-day chart lights up automatically once the mentions-daily worker has 2+ days of history."
        >
          24h totals · log scale · daily buckets collecting
        </span>
      </div>

      <div
        className="vol-chart"
        style={{
          position: "relative",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {totalAll === 0 && <QuietOverlay />}
        {bars.map((bar) => (
          <div
            key={bar.key}
            style={{
              display: "grid",
              gridTemplateColumns: "64px minmax(0, 1fr) 64px",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--fg-muted)",
                textAlign: "right",
              }}
            >
              {bar.label}
            </span>
            <div
              style={{
                height: 14,
                background: "var(--surface-2)",
                borderRadius: 1,
                overflow: "hidden",
              }}
              aria-hidden
            >
              <div
                style={{
                  width: `${widthPct(bar.value)}%`,
                  height: "100%",
                  background: bar.color,
                  opacity: 0.85,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCompact(bar.value)}
            </span>
          </div>
        ))}
      </div>

      <LegendRow
        entries={FALLBACK_BARS.map((bar) => ({ ...bar, value: Math.max(0, totals[bar.key]) }))}
        totalLabel={`${formatCompact(totalAll)} total · 24h`}
        note="log-scaled widths · labels exact"
      />
    </div>
  );
}

export function VolumeAreaChart({ totals, daily }: VolumeAreaChartProps) {
  // A single diff point can't draw an honest area — need 2+ real days.
  const hasHistory = Array.isArray(daily) && daily.length >= 2;
  if (hasHistory) return <DailyStackedChart points={daily} />;
  return <TotalsFallbackBars totals={totals} />;
}
