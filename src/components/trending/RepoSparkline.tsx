// RepoSparkline — tiny Recharts sparkline via the unified AuroraChart
// primitive (variant="sparkline"). One React-chart language across the
// whole site — no more bespoke inline SVG for the trending table cells.
//
// Callers should pass ~30 daily points. Even at 30D, real star-history
// series often end with a sharp spike (a repo breaks out → +N stars on
// day 30 vs flat for 29 days). The basis spline has to pass through every
// datapoint, so the visible curve cliffs at the end. To keep mini-charts
// flowing at the small 80×24 canvas, the input series is pre-smoothed
// with a 7-tap moving-average kernel before being handed to the chart.
// Overall trend direction is preserved; high-frequency cliffs are washed.

import {
  AURORA,
  AuroraChart,
} from "@/components/charts/AuroraChart";
import type { Repo } from "@/lib/types";

interface RepoSparklineProps {
  data?: number[] | null;
  /** Sample from Repo.sparklineData when data not passed directly. */
  repo?: Pick<Repo, "sparklineData" | "starsDelta24h"> | null;
  variant?: "up" | "down" | "muted";
  className?: string;
}

function colorFor(variant: "up" | "down" | "muted"): string {
  if (variant === "down") return AURORA.down;
  if (variant === "muted") return AURORA.inkMuted;
  return AURORA.lead;
}

function variantClass(variant: "up" | "down" | "muted"): string {
  // shell.css uses `.dn` (not `.down`) for the down variant.
  if (variant === "down") return "spark dn";
  if (variant === "muted") return "spark muted";
  return "spark up";
}

// 7-tap moving-average smoother (half-width 3). Edges shrink the kernel
// naturally — point 0 averages itself + 3 neighbours = 4 values; point
// length-1 same. The result is a flowing curve even when the underlying
// daily series ends with a vertical cliff.
function smoothSeries(points: number[]): number[] {
  if (points.length < 4) return points;
  const half = 3;
  return points.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -half; k <= half; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < points.length) {
        sum += points[idx];
        count++;
      }
    }
    return sum / count;
  });
}

export function RepoSparkline({ data, repo, variant, className }: RepoSparklineProps) {
  // Default to the trailing 30 days from the repo payload when callers
  // hand us a repo but no explicit data slice.
  const rawPoints =
    data && data.length > 1 ? data : repo?.sparklineData?.slice(-30) ?? [];

  if (!rawPoints || rawPoints.length < 2) {
    return (
      <div
        className={`spark muted${className ? " " + className : ""}`}
        aria-hidden="true"
      />
    );
  }

  const v =
    variant ??
    (repo?.starsDelta24h !== undefined
      ? repo.starsDelta24h >= 0
        ? "up"
        : "down"
      : "up");

  const color = colorFor(v);
  const cls = `${variantClass(v)}${className ? " " + className : ""}`;

  // Pre-smooth, then reshape into the row format AuroraChart expects.
  const rows = smoothSeries(rawPoints).map((val, i) => ({ idx: i, v: val }));

  return (
    <div className={cls} aria-hidden="true">
      <AuroraChart
        data={rows}
        xKey="idx"
        variant="sparkline"
        height="100%"
        series={[{ dataKey: "v", color }]}
        freeze
      />
    </div>
  );
}
