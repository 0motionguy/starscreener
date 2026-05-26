// Shared chart geometry — produces SVG-coordinate paths + tick positions for
// star-history cumulative data. Used by:
//   - PosterArt (the solid-orange share card in page.tsx)
//   - SketchArt (xkcd-style hand-drawn theme)
//   - any other custom SVG renderer that needs to share a coordinate frame
//
// Lives outside page.tsx so the SVG components don't have to import from a
// `"use client"`-adjacent file or import page-internal types. Pure math, no
// React. Server-renderable.

import type { StarActivityPayload, StarActivityScale } from "@/lib/star-activity";

// Canonical viewBox geometry — every SVG renderer that shares ChartGeometry
// MUST use this same viewBox so the math lines up. Keep in sync with the
// matching constants in page.tsx.
export const VB_W = 1000;
export const VB_H = 340;
export const PAD = { top: 18, right: 22, bottom: 32, left: 56 } as const;
export const INNER_W = VB_W - PAD.left - PAD.right;
export const INNER_H = VB_H - PAD.top - PAD.bottom;

export interface ChartGeometry {
  linePath: string;
  areaPath: string;
  lastDot: { x: number; y: number } | null;
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  peak: { stars: number; date: string } | null;
  current: number;
  first: number;
  windowDelta: number;
  windowDeltaPct: number;
}

function formatStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

// Build a smoothed cubic Bezier path through every projected point. Uses the
// Catmull–Rom tangent rule (control points = previous/next vectors scaled by
// 1/6) which is the same family of curves Recharts' `type="monotone"` and
// ECharts' `smooth: 0.45 + smoothMonotone: "x"` produce. Cumulative data
// never overshoots because the curve is monotone-respecting along x.
function buildSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) {
    return `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  }
  return `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)} ${buildSmoothSegments(coords)}`;
}

// The "segments" half of buildSmoothPath — emitted without a leading M so it
// can be appended into an open path (e.g. the area outline that starts at the
// baseline). Returns an empty string for inputs with fewer than 2 points.
function buildSmoothSegments(coords: Array<{ x: number; y: number }>): string {
  if (coords.length < 2) return "";
  const parts: string[] = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? coords[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    parts.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    );
  }
  return parts.join(" ");
}

function shortDayLabel(iso: string): string {
  const ts = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ts)) return iso.slice(5);
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildChartGeometry(
  payload: StarActivityPayload | null,
  scale: StarActivityScale,
): ChartGeometry | null {
  if (!payload || payload.points.length === 0) return null;
  const points = payload.points;
  const series = points.map((p) => p.s);

  const valuesScaled = scale === "log"
    ? series.map((v) => Math.log10(Math.max(1, v)))
    : series;

  const minV = Math.min(...valuesScaled);
  const maxV = Math.max(...valuesScaled);
  const range = Math.max(1e-9, maxV - minV);
  const yCeiling = maxV + range * 0.06;
  const yFloor = scale === "log" ? minV - range * 0.02 : Math.max(0, minV - range * 0.02);
  const yRange = Math.max(1e-9, yCeiling - yFloor);

  const scaleX = (i: number): number =>
    points.length === 1
      ? PAD.left + INNER_W / 2
      : PAD.left + (i / (points.length - 1)) * INNER_W;
  const scaleY = (v: number): number =>
    PAD.top + INNER_H * (1 - (v - yFloor) / yRange);

  const projected = valuesScaled.map((v, i) => ({ x: scaleX(i), y: scaleY(v) }));
  // Smooth cubic Bezier path (Catmull–Rom style with 1/6 tangent rule),
  // matching the curvature the ECharts main chart uses via
  // `smooth: 0.45 + smoothMonotone: "x"`. Renders soft curves on every
  // custom SVG consumer (SketchArt, PosterArt, …) instead of the old hard
  // polyline segments that read as "broken".
  const linePath = buildSmoothPath(projected);
  const baselineY = PAD.top + INNER_H;
  const areaPath =
    projected.length > 0
      ? `M${projected[0].x.toFixed(2)},${baselineY.toFixed(2)} L${projected[0].x.toFixed(2)},${projected[0].y.toFixed(2)} ${buildSmoothSegments(projected)} L${projected[projected.length - 1].x.toFixed(2)},${baselineY.toFixed(2)} Z`
      : "";

  const rawMin = Math.min(...series);
  const rawMax = Math.max(...series);
  const yTicks = [0.25, 0.5, 0.75, 1].map((t) => {
    const rawValue = rawMin + (rawMax - rawMin) * t;
    const scaledValue = scale === "log" ? Math.log10(Math.max(1, rawValue)) : rawValue;
    return { y: scaleY(scaledValue), label: formatStars(rawValue) };
  });

  const tickCount = Math.min(5, points.length);
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < tickCount; i += 1) {
    const idx =
      tickCount === 1
        ? 0
        : Math.round((i * (points.length - 1)) / (tickCount - 1));
    xTicks.push({ x: scaleX(idx), label: shortDayLabel(points[idx].d) });
  }

  let peakIdx = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].s > points[peakIdx].s) peakIdx = i;
  }
  const peak = { stars: points[peakIdx].s, date: points[peakIdx].d };

  const first = series[0];
  const current = series[series.length - 1];
  const windowDelta = current - first;
  const windowDeltaPct = first > 0 ? (windowDelta / first) * 100 : 0;

  return {
    linePath,
    areaPath,
    lastDot: projected[projected.length - 1] ?? null,
    yTicks,
    xTicks,
    peak,
    current,
    first,
    windowDelta,
    windowDeltaPct,
  };
}
