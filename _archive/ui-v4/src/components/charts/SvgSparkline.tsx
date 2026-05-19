"use client";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}

export function SvgSparkline({
  values,
  width = 84,
  height = 28,
  stroke = "var(--sig-green)",
  className,
}: Props) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const dx = width / (values.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = values
    .map((v, i) => (i === 0 ? "M" : "L") + (i * dx).toFixed(2) + "," + y(v).toFixed(2))
    .join(" ");
  const lastX = (values.length - 1) * dx;
  const lastY = y(values[values.length - 1]);
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={1.6} fill={stroke} />
    </svg>
  );
}
