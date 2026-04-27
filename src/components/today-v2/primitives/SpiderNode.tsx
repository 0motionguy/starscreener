// Spider node SVG — the centerpiece of the V2 hero. Node/01's hero
// illustration recolored: dot-field background, 8 radiating lines from
// a central node to peripheral nodes, the central node filled with
// Liquid Lava orange (the "active object"), peripheral nodes white.
//
// Deterministic — no Math.random() — so server and client renders match
// (no hydration mismatch). The dot pattern is generated from a seeded
// hash so it stays stable across refreshes.

import { cn } from "@/lib/utils";

interface SpiderNodeProps {
  className?: string;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  /** Center node label rendered above the central square. */
  centerLabel?: string;
  /** Optional list of peripheral labels (max 4 will be drawn). */
  peripheralLabels?: string[];
}

// Deterministic dot-field positions — a 21x16 grid stepping by 22px.
// Seeded "size variance" via index parity so a few cells are larger
// "bright dots" while most are small "field dots".
function dotField(): {
  x: number;
  y: number;
  size: number;
  bright: boolean;
}[] {
  const dots: { x: number; y: number; size: number; bright: boolean }[] = [];
  for (let x = 20; x <= 460; x += 22) {
    for (let y = 20; y <= 360; y += 22) {
      // Stable hash: pick a few positions to be brighter / larger.
      const h = (x * 73 + y * 91) % 17;
      const bright = h === 0 || h === 7;
      const size = bright ? 4 : 2;
      dots.push({ x, y, size, bright });
    }
  }
  return dots;
}

const DOTS = dotField();

// Eight peripheral nodes arrayed around the center. Coordinates handpicked
// to feel organic, not symmetrical (matches Node/01's reference).
const NODES: { x: number; y: number; size: number }[] = [
  { x: 78, y: 78, size: 8 },
  { x: 380, y: 78, size: 8 },
  { x: 60, y: 200, size: 8 },
  { x: 400, y: 200, size: 8 },
  { x: 116, y: 316, size: 6 },
  { x: 340, y: 316, size: 6 },
  { x: 230, y: 36, size: 6 },
  { x: 230, y: 350, size: 6 },
];

export function SpiderNode({
  className,
  ariaLabel = "TrendingRepo network — repos and signals wiring up around the active idea",
  centerLabel,
  peripheralLabels,
}: SpiderNodeProps) {
  return (
    <svg
      viewBox="0 0 460 380"
      className={cn("block w-full h-auto", className)}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Background dot-field — the operator canvas. */}
      <g>
        {DOTS.map((d, i) => (
          <rect
            key={i}
            x={d.x - d.size / 2}
            y={d.y - d.size / 2}
            width={d.size}
            height={d.size}
            fill={d.bright ? "var(--v2-ink-300)" : "var(--v2-line-300)"}
          />
        ))}
      </g>

      {/* Radiating lines from center to each peripheral node. */}
      <g
        stroke="var(--v2-line-400)"
        strokeWidth={0.8}
        fill="none"
      >
        {NODES.map((n, i) => (
          <line key={i} x1={230} y1={200} x2={n.x} y2={n.y} />
        ))}
      </g>

      {/* Sentinel-style brackets around the active region. */}
      <g
        stroke="var(--v2-acc)"
        strokeWidth={1.2}
        fill="var(--v2-acc)"
      >
        <rect x={60} y={60} width={14} height={14} />
        <rect x={386} y={60} width={14} height={14} />
        <rect x={60} y={306} width={14} height={14} />
        <rect x={386} y={306} width={14} height={14} />
      </g>

      {/* Dashed inner frame — defines the "active region" between the brackets. */}
      <g
        stroke="var(--v2-acc)"
        strokeWidth={0.6}
        strokeDasharray="2 4"
        fill="none"
        opacity={0.55}
      >
        <rect x={68} y={68} width={324} height={244} />
      </g>

      {/* Central node — the active object. */}
      <rect
        x={218}
        y={188}
        width={24}
        height={24}
        fill="var(--v2-acc)"
      />
      {/* Subtle inset stroke on the center to keep it readable on glow. */}
      <rect
        x={218.5}
        y={188.5}
        width={23}
        height={23}
        fill="none"
        stroke="rgba(0,0,0,0.4)"
        strokeWidth={1}
      />

      {/* Peripheral nodes. */}
      <g fill="var(--v2-ink-000)">
        {NODES.map((n, i) => (
          <rect
            key={i}
            x={n.x - n.size / 2}
            y={n.y - n.size / 2}
            width={n.size}
            height={n.size}
          />
        ))}
      </g>

      {/* Center label — sits above the central node, mono. */}
      {centerLabel ? (
        <text
          x={230}
          y={176}
          textAnchor="middle"
          fill="var(--v2-ink-100)"
          fontSize={9}
          fontFamily="var(--font-geist-mono), monospace"
          letterSpacing="0.2em"
          style={{ textTransform: "uppercase" }}
        >
          {centerLabel}
        </text>
      ) : null}

      {/* Peripheral labels — drawn next to the first 4 nodes if provided. */}
      {peripheralLabels && peripheralLabels.length > 0 ? (
        <g
          fill="var(--v2-ink-300)"
          fontSize={9}
          fontFamily="var(--font-geist-mono), monospace"
          letterSpacing="0.18em"
          style={{ textTransform: "uppercase" }}
        >
          {peripheralLabels.slice(0, 4).map((label, i) => {
            const n = NODES[i];
            const dx = n.x < 230 ? -6 : 6;
            const dy = n.y < 200 ? -8 : 14;
            const anchor = n.x < 230 ? "end" : "start";
            return (
              <text
                key={i}
                x={n.x + dx}
                y={n.y + dy}
                textAnchor={anchor}
              >
                {label}
              </text>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}
