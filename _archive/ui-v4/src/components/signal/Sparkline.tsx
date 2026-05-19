// Inline 8-point sparkline used inside metric cards. Pure SVG, no axes,
// 1px stroke. Renders nothing when given fewer than 2 data points so a
// zero-data tile collapses cleanly instead of showing a flat line.

interface SparklineProps {
  data: number[];
  /** width × height. Defaults are sized to fit a 130px-wide metric card. */
  width?: number;
  height?: number;
  /** Tailwind color class for the stroke. Default: brand orange. */
  strokeClass?: string;
  /** Render as filled area below the line (subtle alpha). */
  filled?: boolean;
}

export function Sparkline({
  data,
  width = 96,
  height = 24,
  strokeClass = "stroke-brand",
  filled = true,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");

  const areaPath = filled
    ? `${linePath} L ${width} ${height} L 0 ${height} Z`
    : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block overflow-visible"
      aria-hidden
    >
      {filled ? (
        <path d={areaPath} className={strokeClass} fill="currentColor" fillOpacity={0.12} stroke="none" />
      ) : null}
      <path
        d={linePath}
        className={strokeClass}
        fill="none"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Sparkline;
