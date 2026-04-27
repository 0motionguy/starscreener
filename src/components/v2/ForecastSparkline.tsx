// V2 design-system primitive — forecast sparkline with past + future band.
// Past = solid gray area + line. Future = dashed brand mid-line + shaded band.

interface ForecastSparklineProps {
  past: number[];
  currentStars: number;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  horizonDays: number;
  width?: number;
  height?: number;
}

export function ForecastSparkline({
  past,
  currentStars,
  pointEstimate,
  lowP10: _lowP10,
  highP90,
  horizonDays,
  width = 280,
  height = 72,
}: ForecastSparklineProps): React.ReactElement {
  const totalPoints = past.length + horizonDays;
  const pastPoints = past.length;
  const lastPast = past[past.length - 1] ?? currentStars;

  const forecastPath: Array<{ x: number; mid: number; low: number; high: number }> = [];
  for (let i = 0; i <= horizonDays; i++) {
    const t = i / horizonDays;
    const mid = lastPast + (pointEstimate - lastPast) * t;
    const bandHalf = ((highP90 - pointEstimate) / 2) * Math.sqrt(t);
    forecastPath.push({
      x: pastPoints + i,
      mid,
      low: mid - bandHalf,
      high: mid + bandHalf,
    });
  }

  const allYs = [
    ...past,
    ...forecastPath.map((p) => p.low),
    ...forecastPath.map((p) => p.high),
  ];
  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);
  const yPad = (maxY - minY) * 0.12;
  const yLo = minY - yPad;
  const yHi = maxY + yPad;

  const toX = (idx: number) => (idx / (totalPoints - 1)) * width;
  const toY = (val: number) => height - ((val - yLo) / (yHi - yLo)) * height;

  const pastD = past
    .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(" ");
  const forecastMidD = forecastPath
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.mid).toFixed(1)}`)
    .join(" ");
  const bandD = [
    ...forecastPath.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.high).toFixed(1)}`),
    ...[...forecastPath].reverse().map((p) => `L ${toX(p.x).toFixed(1)} ${toY(p.low).toFixed(1)}`),
    "Z",
  ].join(" ");

  const splitX = toX(pastPoints - 1);
  const pastArea = `${pastD} L ${toX(pastPoints - 1).toFixed(1)} ${height} L 0 ${height} Z`;

  const gradId = `band-grad-${horizonDays}-${Math.random().toString(36).slice(2, 6)}`;
  const pastGradId = `past-grad-${horizonDays}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-20" aria-label="Forecast sparkline">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F56E0F" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F56E0F" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={pastGradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#C4C4C6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#C4C4C6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={pastArea} fill={`url(#${pastGradId})`} />
      <path d={bandD} fill={`url(#${gradId})`} />
      <path d={pastD} className="fill-none stroke-text-secondary" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={forecastMidD}
        className="fill-none stroke-brand"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 3"
        style={{ filter: "drop-shadow(0 0 4px rgba(245,110,15,0.5))" }}
      />
      <line x1={splitX} x2={splitX} y1="0" y2={height} className="stroke-text-muted" strokeWidth="0.5" strokeDasharray="2 2" />
      <circle
        cx={splitX}
        cy={toY(lastPast)}
        r="3.5"
        className="fill-brand stroke-bg-card"
        strokeWidth="1.5"
        style={{ filter: "drop-shadow(0 0 6px rgba(245,110,15,0.8))" }}
      />
    </svg>
  );
}
