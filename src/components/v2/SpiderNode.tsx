// V2 design-system primitive — spider/network node graph SVG.
// Center node + N peripheral nodes connected by hairlines on a dot-field.
// Used in hero illustrations to visualize "repos forming around an idea."

type SpiderNodeProps = {
  width?: number;
  height?: number;
  peripheral?: number;
  centerColor?: string;
  nodeColor?: string;
  lineColor?: string;
  dotColor?: string;
  className?: string;
};

export function SpiderNode({
  width = 240,
  height = 240,
  peripheral = 10,
  centerColor = "var(--v2-acc)",
  nodeColor = "var(--v2-ink-100)",
  lineColor = "var(--v2-line-300)",
  dotColor = "var(--v2-dot)",
  className = "",
}: SpiderNodeProps) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  const nodes = Array.from({ length: peripheral }, (_, i) => {
    const angle = (i / peripheral) * Math.PI * 2 - Math.PI / 2;
    const wobble = ((i % 3) - 1) * (radius * 0.12);
    const r = radius + wobble;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      key: i,
    };
  });

  const dotSpacing = 14;
  const dots: { x: number; y: number; k: string }[] = [];
  for (let x = dotSpacing / 2; x < width; x += dotSpacing) {
    for (let y = dotSpacing / 2; y < height; y += dotSpacing) {
      dots.push({ x, y, k: `${x}-${y}` });
    }
  }

  return (
    <svg
      role="img"
      aria-label="Network of repositories around an idea"
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      <g>
        {dots.map((dot) => (
          <circle key={dot.k} cx={dot.x} cy={dot.y} r={0.7} fill={dotColor} />
        ))}
      </g>
      <g stroke={lineColor} strokeWidth={1} fill="none">
        {nodes.map((node) => (
          <line key={`l-${node.key}`} x1={cx} y1={cy} x2={node.x} y2={node.y} />
        ))}
      </g>
      <g>
        {nodes.map((node) => (
          <rect
            key={`n-${node.key}`}
            x={node.x - 3}
            y={node.y - 3}
            width={6}
            height={6}
            fill={nodeColor}
          />
        ))}
      </g>
      <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={centerColor} />
    </svg>
  );
}
