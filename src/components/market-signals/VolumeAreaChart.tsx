"use client";

// VolumeAreaChart — stacked 30-day source-volume area chart.
// Must be a Client Component because it passes function props (yFormatter,
// tooltipFormatter, xFormatter, tooltipLabelFormatter) into <AuroraChart>,
// which is itself "use client". The Server→Client boundary cannot serialize
// functions, so the wrapper has to live on the same (client) side.
//
// HONEST DATA CONTRACT: the per-source TOTALS are real (from the live
// data spine, no seeded floors). The DAILY DISTRIBUTION is flat — every
// day in the 30-day window gets total/30 — because per-source daily
// mention buckets aren't yet aggregated by TOOLBOX. The chart caption
// discloses this. When daily buckets land, swap flatDistribution() for
// the real per-day series and the rest of this file keeps working.
//
// 2026-05-24 — migrated from inline SVG to the unified `<AuroraChart>`
// stacked-area Recharts primitive so every chart on the site (except the
// /tools/compare workbench, which has its own theme switcher) reads as
// one consistent visual language.

import {
  AuroraChart,
  type AuroraSeries,
} from "@/components/charts/AuroraChart";

interface VolumeAreaChartProps {
  totals: {
    github: number;
    x: number;
    hn: number;
    bsky: number;
    devto: number;
  };
}

const DAYS = 30;

// Layer order matters — first = bottom of the stack. We stack in source-
// brand colours so the legend chips stay readable even though the chart
// itself sits inside the Aurora palette framework.
const LAYERS: Array<{
  key: keyof VolumeAreaChartProps["totals"];
  label: string;
  color: string;
}> = [
  { key: "hn",     label: "HN",      color: "#ff6600" },
  { key: "devto",  label: "Dev.to",  color: "#fff5b1" },
  { key: "bsky",   label: "Bluesky", color: "#1185fe" },
  { key: "x",      label: "X",       color: "#ffffff" },
  { key: "github", label: "GitHub",  color: "#8b5cf6" },
];

function flatDistribution(total: number, days: number): number[] {
  if (total <= 0) return new Array(days).fill(0);
  const perDay = total / days;
  return new Array(days).fill(perDay);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function buildLabel(idx: number): string {
  // -29d … today, only render every 7th label for the eye.
  const fromToday = DAYS - 1 - idx;
  if (fromToday === 0) return "today";
  return `-${fromToday}d`;
}

export function VolumeAreaChart({ totals }: VolumeAreaChartProps) {
  // Build one row per day with one field per layer — this is the shape
  // <AuroraChart variant="stacked" /> expects.
  type Row = { day: string } & Partial<Record<typeof LAYERS[number]["key"], number>>;
  const data: Row[] = new Array(DAYS).fill(0).map((_, i) => {
    const row: Row = { day: buildLabel(i) };
    for (const layer of LAYERS) {
      const series = flatDistribution(totals[layer.key], DAYS);
      row[layer.key] = series[i];
    }
    return row;
  });

  const series: AuroraSeries[] = LAYERS.map((layer) => ({
    dataKey: layer.key,
    name: layer.label,
    color: layer.color,
  }));

  const totalAll = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const allQuiet = totalAll === 0;

  return (
    <div className="card cockpit-wide">
      <div className="card-head">
        <h2 className="card-title">
          <b>Mention volume</b> · stacked by source · 24h totals
        </h2>
        <span className="grow" />
        <span
          className="chip"
          title="Per-day mention buckets not yet aggregated by TOOLBOX. Bands show 24h totals distributed evenly across the 30-day window."
        >
          24h totals · daily shape pending
        </span>
      </div>

      <div className="vol-chart" style={{ position: "relative", padding: "8px 14px" }}>
        {allQuiet && (
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
        )}
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
          ariaLabel="30-day stacked mention volume by source"
        />
      </div>

      <div
        className="row gap-4"
        style={{
          padding: "8px 16px 14px",
          borderTop: "1px solid var(--border-subtle)",
          flexWrap: "wrap",
        }}
      >
        {LAYERS.slice()
          .reverse()
          .map((layer) => (
            <span
              key={layer.key}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--fg-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ width: 10, height: 10, background: layer.color }} />
              {layer.label}{" "}
              <b style={{ color: "var(--fg)" }}>{formatCompact(totals[layer.key])}</b>
            </span>
          ))}
        <span className="grow" />
        <span
          className="faint"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}
        >
          {formatCompact(totalAll)} total
        </span>
      </div>
    </div>
  );
}
