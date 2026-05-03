"use client";

// Client-side canvas for /mindshare.
//
// What changed from the server-only v1: each bubble's perimeter arcs are
// now PROPORTIONAL to that channel's share of 24h mention volume — the
// canonical "mindshare" reading. An arc is also lit (bright + thicker)
// when the channel is currently firing per cross-signal scoring; dim but
// still proportionally sized when not.
//
// Hover → tooltip with per-channel breakdown. Click → /repo/{owner}/{name}.
//
// All layout (cx/cy/r) is precomputed by the server page via packBubbles
// so this canvas does no math beyond arc geometry per render.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHANNELS,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  type BubbleRow,
  type Channel,
} from "./channels";

interface MindShareCanvasProps {
  rows: BubbleRow[];
  width: number;
  height: number;
  bgColor: string;
  bgTertiary: string;
  borderColor: string;
  textPrimaryColor: string;
  textTertiaryColor: string;
}

interface ArcSegment {
  d: string;
  channel: Channel;
  /** True when arc length > 0; false when channel had no mentions. */
  visible: boolean;
}

// 4° gap between arcs so neighbours read as distinct slices.
const ARC_GAP_RAD = 0.07;
const TWO_PI = Math.PI * 2;
// Minimum visible arc fraction so a channel with 1% share doesn't disappear.
const MIN_ARC_FRACTION = 0.04;

/**
 * Build proportional arc segments around a bubble. When `totalShare` is
 * 0 (cold start, no mentions data yet), splits the perimeter equally so
 * the bubble still renders the 5-arc visual identity.
 */
function buildProportionalArcs(
  cx: number,
  cy: number,
  r: number,
  shares: Record<Channel, number>,
  totalShare: number,
): ArcSegment[] {
  const out: ArcSegment[] = [];
  if (r <= 0) return out;

  // Determine each channel's arc fraction (0..1).
  const fractions: Record<Channel, number> = {
    github: 0,
    reddit: 0,
    hn: 0,
    bluesky: 0,
    devto: 0,
  };
  if (totalShare > 0) {
    let allocated = 0;
    for (const c of CHANNELS) {
      const raw = shares[c] / totalShare;
      // Floor non-zero channels at MIN_ARC_FRACTION so they don't vanish;
      // re-normalize so fractions sum to 1.
      const floored = raw > 0 ? Math.max(MIN_ARC_FRACTION, raw) : 0;
      fractions[c] = floored;
      allocated += floored;
    }
    if (allocated > 0 && allocated !== 1) {
      for (const c of CHANNELS) fractions[c] = fractions[c] / allocated;
    }
  } else {
    // Cold-start fallback: equal arcs (legacy v1 behaviour).
    for (const c of CHANNELS) fractions[c] = 1 / CHANNELS.length;
  }

  // Walk perimeter clockwise from 12 o'clock.
  let cursor = -Math.PI / 2;
  for (const c of CHANNELS) {
    const sweep = fractions[c] * TWO_PI;
    if (sweep <= 0) {
      out.push({ d: "", channel: c, visible: false });
      continue;
    }
    // Subtract gap so arcs don't touch — but only if there's room for one.
    const useGap = sweep > ARC_GAP_RAD * 2;
    const a0 = cursor + (useGap ? ARC_GAP_RAD / 2 : 0);
    const a1 = cursor + sweep - (useGap ? ARC_GAP_RAD / 2 : 0);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const largeArc = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    out.push({ d, channel: c, visible: true });
    cursor += sweep;
  }
  return out;
}

function fmtScore(s: number): string {
  return s.toFixed(2);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + "…";
}

interface HoverState {
  rowId: string;
  /** Pointer-position in viewBox-user-space. */
  x: number;
  y: number;
}

export function MindShareCanvas({
  rows,
  width,
  height,
  bgColor,
  bgTertiary,
  borderColor,
  textPrimaryColor,
  textTertiaryColor,
}: MindShareCanvasProps) {
  const router = useRouter();
  const [hover, setHover] = useState<HoverState | null>(null);

  const hovered = hover ? rows.find((r) => r.id === hover.rowId) ?? null : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto"
        aria-label="MindShare cross-source attention map"
      >
        <rect x={0} y={0} width={width} height={height} fill={bgColor} />
        {rows.map((row) => (
          <BubbleSvg
            key={row.id}
            row={row}
            bgTertiary={bgTertiary}
            borderColor={borderColor}
            textPrimaryColor={textPrimaryColor}
            textTertiaryColor={textTertiaryColor}
            onEnter={(x, y) => setHover({ rowId: row.id, x, y })}
            onLeave={() => setHover(null)}
            onClick={() => router.push(`/repo/${row.owner}/${row.name}`)}
          />
        ))}
      </svg>
      {hovered && hover && (
        <Tooltip
          row={hovered}
          // Translate from viewBox-user-space back into SVG container px.
          // Container is full-width responsive, so use percentages.
          xPct={(hover.x / width) * 100}
          yPct={(hover.y / height) * 100}
        />
      )}
    </div>
  );
}

interface BubbleSvgProps {
  row: BubbleRow;
  bgTertiary: string;
  borderColor: string;
  textPrimaryColor: string;
  textTertiaryColor: string;
  onEnter: (x: number, y: number) => void;
  onLeave: () => void;
  onClick: () => void;
}

function BubbleSvg({
  row,
  bgTertiary,
  borderColor,
  textPrimaryColor,
  textTertiaryColor,
  onEnter,
  onLeave,
  onClick,
}: BubbleSvgProps) {
  const { pack, firing, shares, totalShare, fullName, shortName, score } = row;
  const arcs = buildProportionalArcs(
    pack.cx,
    pack.cy,
    pack.r,
    shares,
    totalShare,
  );
  const labelFontSize = Math.max(11, Math.min(18, pack.r * 0.32));
  const scoreFontSize = Math.max(10, Math.min(14, pack.r * 0.22));
  const labelMaxChars = Math.max(6, Math.floor((pack.r * 2) / (labelFontSize * 0.55)));
  const firingCount = Object.values(firing).filter(Boolean).length;

  return (
    <g
      style={{ cursor: "pointer" }}
      onMouseEnter={(e) => {
        const target = e.currentTarget as SVGGElement;
        const owner = target.ownerSVGElement;
        if (!owner) {
          onEnter(pack.cx, pack.cy);
          return;
        }
        // Translate pointer into SVG user-space (the viewBox coordinates
        // we packed against), so the tooltip sits next to the bubble even
        // after CSS scaling.
        const point = owner.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const ctm = owner.getScreenCTM();
        if (!ctm) {
          onEnter(pack.cx, pack.cy);
          return;
        }
        const local = point.matrixTransform(ctm.inverse());
        onEnter(local.x, local.y);
      }}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <title>{`${fullName}\nscore ${fmtScore(score)} · ${firingCount}/5 channels firing`}</title>
      {/* Inner disk — neutral so arc colors carry channel identity */}
      <circle
        cx={pack.cx}
        cy={pack.cy}
        r={pack.r - 6}
        fill={bgTertiary}
        stroke={borderColor}
        strokeWidth={1}
      />
      {/* Proportional arcs — bright/thick when firing, dim/thin when not */}
      {arcs.map((arc) =>
        arc.visible ? (
          <path
            key={arc.channel}
            d={arc.d}
            fill="none"
            stroke={firing[arc.channel] ? CHANNEL_COLORS[arc.channel] : borderColor}
            strokeWidth={firing[arc.channel] ? 5 : 2}
            strokeLinecap="round"
            opacity={firing[arc.channel] ? 1 : 0.5}
          />
        ) : null,
      )}
      {/* Label */}
      <text
        x={pack.cx}
        y={pack.cy - labelFontSize * 0.15}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={labelFontSize}
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fill={textPrimaryColor}
        style={{ fontWeight: 600, pointerEvents: "none" }}
      >
        {truncate(shortName, labelMaxChars)}
      </text>
      <text
        x={pack.cx}
        y={pack.cy + labelFontSize * 1.05}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={scoreFontSize}
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fill={textTertiaryColor}
        style={{ pointerEvents: "none" }}
      >
        {fmtScore(score)}
      </text>
    </g>
  );
}

interface TooltipProps {
  row: BubbleRow;
  xPct: number;
  yPct: number;
}

function Tooltip({ row, xPct, yPct }: TooltipProps) {
  const firingCount = Object.values(row.firing).filter(Boolean).length;
  // Channels sorted desc by 24h share so the dominant source is on top.
  const sortedChannels = [...CHANNELS].sort(
    (a, b) => row.shares[b] - row.shares[a],
  );
  // Keep the tooltip inside the canvas — flip when near the right edge.
  const flipX = xPct > 70;
  const flipY = yPct > 70;
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${xPct}%`,
    top: `${yPct}%`,
    transform: `translate(${flipX ? "calc(-100% - 12px)" : "12px"}, ${flipY ? "calc(-100% - 12px)" : "12px"})`,
    pointerEvents: "none",
    zIndex: 10,
  };
  return (
    <div
      style={style}
      className="rounded-card border border-border-primary bg-bg-secondary px-3 py-2 shadow-lg min-w-[200px] max-w-[260px]"
    >
      <div className="text-[12px] font-mono font-semibold text-text-primary truncate">
        {row.fullName}
      </div>
      <div className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-text-tertiary">
        score {fmtScore(row.score)} · {firingCount}/5 firing
      </div>
      <div className="mt-2 space-y-1">
        {sortedChannels.map((c) => {
          const pct =
            row.totalShare > 0
              ? Math.round((row.shares[c] / row.totalShare) * 100)
              : 0;
          const lit = row.firing[c];
          return (
            <div key={c} className="flex items-center gap-2 text-[11px] font-mono">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: lit ? CHANNEL_COLORS[c] : "transparent",
                  border: lit ? "none" : `1px solid ${CHANNEL_COLORS[c]}`,
                  opacity: lit ? 1 : 0.5,
                }}
              />
              <span className="text-text-secondary flex-1">{CHANNEL_LABELS[c]}</span>
              <span className="text-text-tertiary tabular-nums">
                {row.shares[c]} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 pt-1.5 border-t border-border-primary text-[10px] font-mono text-text-tertiary">
        click to open repo
      </div>
    </div>
  );
}
