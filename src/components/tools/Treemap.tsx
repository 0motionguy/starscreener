// V4 — Treemap
//
// Pure-SVG treemap for tools.html § Treemap and category-flow visualisations.
// The mockup hand-tunes cell layout (slice/dice rather than algorithmic
// squarify) so we accept already-positioned cells. Caller decides geometry.
//
// Cell anatomy:
//   - background fill (caller's color × opacity)
//   - 1px black stroke between cells
//   - top-left CAPS label (mockup-canonical 8-12px, weight 700)
//   - secondary subtitle below (sans 7-12px depending on cell height)
//
// Usage:
//   <Treemap
//     width={600}
//     height={330}
//     cells={[
//       { x: 0, y: 0, w: 170, h: 200, color: "#3ad6c5",
//         label: "AI", sub: "hermes-a…", big: true },
//       { x: 170, y: 0, w: 120, h: 160, color: "#3a86ff",
//         label: "LLM", sub: "everything-cl…" },
//       { x: 290, y: 0, w: 90, h: 100, color: "#ff6b35",
//         label: "AI-AGENT", sub: "rtk" },
//       ...
//     ]}
//   />

import { cn } from "@/lib/utils";

export interface TreemapCell {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
  sub?: string;
  /** Cell-level opacity override (0..1). Defaults to 0.66, or 0.78 when big. */
  opacity?: number;
  /** Mark this cell as the hero — bumps subtitle font + weight. */
  big?: boolean;
}

export interface TreemapProps {
  cells: TreemapCell[];
  /** SVG viewBox width. Default 600. */
  width?: number;
  /** SVG viewBox height. Default 330. */
  height?: number;
  className?: string;
}

export function Treemap({
  cells,
  width = 600,
  height = 330,
  className,
}: TreemapProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("v4-treemap", className)}
      preserveAspectRatio="none"
      role="img"
      aria-label="Treemap of categories"
      style={{ width: "100%", display: "block" }}
    >
      {cells.map((c, i) => {
        const op = c.opacity ?? (c.big ? 0.78 : 0.66);
        const labelFs = Math.min(12, Math.max(8, c.h / 14));
        const subFs = c.big ? 14 : Math.min(11, Math.max(7.5, c.h / 16));
        return (
          <g key={i}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              fill={c.color}
              fillOpacity={op}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth="1"
            />
            {c.label ? (
              <text
                x={c.x + 6}
                y={c.y + 12}
                fontFamily="var(--v4-mono)"
                fontSize={labelFs}
                fill="rgba(0,0,0,0.6)"
                fontWeight="700"
                letterSpacing="0.10em"
              >
                {c.label}
              </text>
            ) : null}
            {c.sub && c.h > 36 ? (
              <text
                x={c.x + 6}
                y={c.y + (c.label ? 28 : 14)}
                fontFamily="var(--v4-mono)"
                fontSize={subFs}
                fill={c.big ? "#0a0a0a" : "rgba(0,0,0,0.85)"}
                fontWeight={c.big ? 700 : 500}
              >
                {c.sub}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
