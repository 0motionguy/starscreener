/**
 * @deprecated Currently orphaned — no consumers post-#1606 v4 rebuild.
 *
 * Was used for synthetic time-series ("growth curves") which violated
 * the freshness-honesty rule. Will relight once a real score-history
 * collector ships and emits per-repo timestamped series. Until then:
 * do NOT import this file. If you need a sparkline for a different
 * purpose, evaluate a shared sparkline primitive (or build one with
 * proper data-store backing) instead of importing this stub.
 *
 * Tracking: dead-code sweep #1606 / 2026-05-17.
 */
// Tiny SVG sparkline used across the Agent Commerce surfaces (movers board,
// activity pulse, MiniBoard). Extracted from `src/app/agent-commerce/page.tsx`
// as part of A8-P2 so co-located sections can render their own bars without
// duplicating the path math.

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}

export function Sparkline({
  data,
  width = 80,
  height = 22,
  color = "currentColor",
  fillOpacity = 0.12,
}: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.001, max - min);
  const xstep = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * xstep;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });
  const linePath = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} L ${points
    .slice(1)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" L ")}`;
  const areaPath = `${linePath} L ${width.toFixed(1)},${height.toFixed(1)} L 0,${height.toFixed(1)} Z`;
  const last = points[points.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={color} />
    </svg>
  );
}
