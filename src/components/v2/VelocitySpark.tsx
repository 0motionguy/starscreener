// V2 design-system primitive — mini bar-chart sparkline.
// Decorative, no interactivity. Derived from a number[] of daily values.

interface VelocitySparkProps {
  data: number[];
  width?: number;
  height?: number;
}

export function VelocitySpark({ data, width = 240, height = 48 }: VelocitySparkProps): React.ReactElement {
  const max = Math.max(...data, 1);
  const barW = width / data.length - 2;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-12">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * height);
        const x = i * (width / data.length) + 1;
        const y = height - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            className="fill-brand"
            opacity={0.4 + 0.08 * i}
          />
        );
      })}
    </svg>
  );
}

interface VelocitySparkMiniProps {
  data: number[];
}

export function VelocitySparkMini({ data }: VelocitySparkMiniProps): React.ReactElement {
  const W = 64;
  const H = 24;
  const max = Math.max(...data, 1);
  const barW = W / data.length - 1.5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-6">
      {data.map((v, i) => {
        const h = Math.max(1.5, (v / max) * H);
        const x = i * (W / data.length) + 0.75;
        const y = H - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1}
            className="fill-brand"
            opacity={0.4 + 0.08 * i}
          />
        );
      })}
    </svg>
  );
}
