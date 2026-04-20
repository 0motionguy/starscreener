"use client";

import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  className?: string;
}

/**
 * Minimum non-zero samples required before we draw a real sparkline. Below
 * this threshold the series is too short to convey a trend — we render a
 * dotted baseline instead to signal "collecting history" without leaving
 * an empty box.
 */
const MIN_SAMPLES = 2;

/**
 * Pure SVG sparkline — lightweight inline chart.
 * Draws a smooth quadratic bezier path with a subtle fill area beneath.
 * When the series is too sparse (fewer than MIN_SAMPLES non-zero points
 * OR all zeros), a dotted horizontal baseline is drawn as a placeholder.
 */
export function Sparkline({
  data,
  width = 80,
  height = 24,
  positive = true,
  className,
}: SparklineProps) {
  const nonZeroCount = useMemo(
    () => data.filter((n) => Number.isFinite(n) && n !== 0).length,
    [data],
  );
  // A series with fewer than MIN_SAMPLES values, all zeros, or all identical
  // values (common when the repo exceeds GitHub's stargazer list cap and
  // deriveSparklineData had to carry one data point forward across every
  // slot) is not a real trend — show the placeholder instead.
  const isSparse = data.length < MIN_SAMPLES || nonZeroCount === 0;

  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2 || isSparse) return { linePath: "", areaPath: "" };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Padding so the stroke doesn't clip at edges
    const padX = 1;
    const padY = 2;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    // Map data to (x, y) points — y is inverted (SVG origin top-left)
    const points = data.map((v, i) => ({
      x: padX + (i / (data.length - 1)) * innerW,
      y: padY + innerH - ((v - min) / range) * innerH,
    }));

    // Build smooth quadratic bezier path
    let line = `M ${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpX = (curr.x + next.x) / 2;
      const cpY = (curr.y + next.y) / 2;

      if (i === 0) {
        line += ` Q ${curr.x},${curr.y} ${cpX},${cpY}`;
      } else {
        line += ` T ${cpX},${cpY}`;
      }
    }

    // End at last point
    const last = points[points.length - 1];
    line += ` T ${last.x},${last.y}`;

    // Area path = line path + close down to bottom
    const area =
      line +
      ` L ${last.x},${height} L ${points[0].x},${height} Z`;

    return { linePath: line, areaPath: area };
  }, [data, width, height, isSparse]);

  if (isSparse) {
    // Dotted baseline — signals "collecting history" without breaking layout.
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d={`M ${Math.round(width * 0.18)} ${height / 2} H ${Math.round(width * 0.7)}`}
          stroke="var(--color-text-muted, var(--color-text-tertiary))"
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.35}
        />
        <circle
          cx={Math.round(width * 0.78)}
          cy={height / 2}
          r={2.5}
          fill="var(--color-text-muted, var(--color-text-tertiary))"
          opacity={0.75}
        />
      </svg>
    );
  }

  const strokeColor = positive
    ? "var(--color-accent-green)"
    : "var(--color-accent-red)";

  const fillColor = positive
    ? "var(--color-accent-green)"
    : "var(--color-accent-red)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Area fill */}
      <path d={areaPath} fill={fillColor} opacity={0.15} />
      {/* Line stroke */}
      <path
        d={linePath}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
