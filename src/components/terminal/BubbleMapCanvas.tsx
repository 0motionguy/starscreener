"use client";

// Client-side physics renderer for the trending bubble map.
//
// Takes seed positions from the server-computed circle pack and runs a
// small verlet-ish integrator in a requestAnimationFrame loop. Bubbles
// repel pair-wise (soft collision resolve), drift slightly toward the
// canvas center, and bounce off the walls. Pointer-drag grabs the
// nearest bubble and fixes it; release imparts the pointer's velocity.
//
// The simulation writes `transform="translate(cx cy)"` directly on each
// <g> via refs — React state is only used for the dragging id so the
// 60fps loop stays outside the reconciler. Click-without-drag still
// navigates to the repo detail page.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { formatNumber } from "@/lib/utils";

export interface BubbleSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  delta: number;
  fullName: string;
  name: string;
  owner: string;
  avatarUrl: string;
  fill: string;
  stroke: string;
  glow: string;
  textColor: string;
}

interface Body extends BubbleSeed {
  vx: number;
  vy: number;
  /** When >0, this body is anchored (being dragged or recently released). */
  held: boolean;
}

interface BubbleMapCanvasProps {
  seeds: BubbleSeed[];
  width: number;
  height: number;
}

const SIM = {
  centerPull: 0.00045,
  damping: 0.92,
  pairPad: 1.5,
  wallBounce: -0.35,
  /** Pointer-velocity multiplier on release (fling strength). */
  flingScale: 0.5,
  /** Velocity below which we skip the per-frame DOM write. */
  idleThreshold: 0.005,
};

/**
 * Low-drag threshold: pointer traveled less than this → treat as click.
 * In the same coordinate space as the SVG (pre-scale), so drags that are
 * ≤ 4 CSS px still register as a click when the viewBox is scaled down.
 */
const CLICK_DRAG_THRESHOLD = 5;

export function BubbleMapCanvas({ seeds, width, height }: BubbleMapCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Record<string, SVGGElement | null>>({});
  const bodies = useRef<Body[]>(
    seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false })),
  );

  // Keep the body array in sync when the seed list changes (e.g. hourly
  // trending refresh re-renders the parent). New ids get seeded fresh;
  // existing ids keep their in-flight cx/cy/vx/vy so the animation
  // doesn't jump.
  useEffect(() => {
    const prev = new Map(bodies.current.map((b) => [b.id, b]));
    bodies.current = seeds.map((s) => {
      const existing = prev.get(s.id);
      return existing
        ? { ...existing, ...s, vx: existing.vx, vy: existing.vy, held: false }
        : { ...s, vx: 0, vy: 0, held: false };
    });
  }, [seeds]);

  // Pointer state refs (outside React render for perf).
  const pointer = useRef<{
    active: boolean;
    id: string | null;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    vx: number;
    vy: number;
    moved: number;
    pointerId: number | null;
  }>({
    active: false,
    id: null,
    offsetX: 0,
    offsetY: 0,
    lastX: 0,
    lastY: 0,
    vx: 0,
    vy: 0,
    moved: 0,
    pointerId: null,
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Convert a pointer event (client coords) to SVG viewBox coords.
  const toSvgCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const local = pt.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    },
    [],
  );

  // ------------- physics loop -------------
  useEffect(() => {
    let raf = 0;

    function step() {
      const list = bodies.current;
      const n = list.length;

      // 1. Apply forces (center gravity + damping).
      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) continue;
        a.vx += (width / 2 - a.cx) * SIM.centerPull;
        a.vy += (height / 2 - a.cy) * SIM.centerPull;
        a.vx *= SIM.damping;
        a.vy *= SIM.damping;
      }

      // 2. Integrate velocities.
      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) continue;
        a.cx += a.vx;
        a.cy += a.vy;
      }

      // 3. Pair-wise soft collision resolve.
      for (let i = 0; i < n; i++) {
        const a = list[i];
        for (let j = i + 1; j < n; j++) {
          const b = list[j];
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const distSq = dx * dx + dy * dy;
          const min = a.r + b.r + SIM.pairPad;
          if (distSq < min * min && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const overlap = (min - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            if (a.held && b.held) {
              // both held; do nothing
            } else if (a.held) {
              b.cx += nx * overlap * 2;
              b.cy += ny * overlap * 2;
            } else if (b.held) {
              a.cx -= nx * overlap * 2;
              a.cy -= ny * overlap * 2;
            } else {
              a.cx -= nx * overlap;
              a.cy -= ny * overlap;
              b.cx += nx * overlap;
              b.cy += ny * overlap;
              // Impart a small tangent-friendly kick so stuck pairs
              // don't sit on top of each other forever.
              a.vx -= nx * 0.08;
              a.vy -= ny * 0.08;
              b.vx += nx * 0.08;
              b.vy += ny * 0.08;
            }
          }
        }
      }

      // 4. Wall bounce.
      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) continue;
        if (a.cx < a.r) {
          a.cx = a.r;
          a.vx *= SIM.wallBounce;
        } else if (a.cx > width - a.r) {
          a.cx = width - a.r;
          a.vx *= SIM.wallBounce;
        }
        if (a.cy < a.r) {
          a.cy = a.r;
          a.vy *= SIM.wallBounce;
        } else if (a.cy > height - a.r) {
          a.cy = height - a.r;
          a.vy *= SIM.wallBounce;
        }
      }

      // 5. Write transforms to the DOM — but only when the body moved
      //    meaningfully this frame, to keep idle CPU near zero.
      for (let i = 0; i < n; i++) {
        const a = list[i];
        const node = groupRefs.current[a.id];
        if (!node) continue;
        const speed = Math.abs(a.vx) + Math.abs(a.vy);
        if (speed > SIM.idleThreshold || a.held) {
          node.setAttribute("transform", `translate(${a.cx} ${a.cy})`);
        }
      }

      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  // ------------- pointer handlers -------------
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, id: string) => {
      const coords = toSvgCoords(e.clientX, e.clientY);
      if (!coords) return;
      const body = bodies.current.find((b) => b.id === id);
      if (!body) return;

      // Lift the body visually (pointerId captured on the svg root).
      const svg = svgRef.current;
      if (svg) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          // ignore — some browsers dislike capturing on SVG root
        }
      }
      pointer.current = {
        active: true,
        id,
        offsetX: body.cx - coords.x,
        offsetY: body.cy - coords.y,
        lastX: coords.x,
        lastY: coords.y,
        vx: 0,
        vy: 0,
        moved: 0,
        pointerId: e.pointerId,
      };
      body.held = true;
      body.vx = 0;
      body.vy = 0;
      setDraggingId(id);
    },
    [toSvgCoords],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const p = pointer.current;
      if (!p.active || !p.id) return;
      const coords = toSvgCoords(e.clientX, e.clientY);
      if (!coords) return;

      const body = bodies.current.find((b) => b.id === p.id);
      if (!body) return;

      // Track pointer velocity + total travel distance (for click detection).
      const dx = coords.x - p.lastX;
      const dy = coords.y - p.lastY;
      p.vx = dx;
      p.vy = dy;
      p.lastX = coords.x;
      p.lastY = coords.y;
      p.moved += Math.abs(dx) + Math.abs(dy);

      // Snap the body to the pointer (with initial grab-offset preserved).
      body.cx = coords.x + p.offsetX;
      body.cy = coords.y + p.offsetY;
    },
    [toSvgCoords],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const p = pointer.current;
      if (!p.active || !p.id) return;
      const body = bodies.current.find((b) => b.id === p.id);
      if (body) {
        body.held = false;
        body.vx = p.vx * SIM.flingScale;
        body.vy = p.vy * SIM.flingScale;
      }

      const wasShortDrag = p.moved < CLICK_DRAG_THRESHOLD;

      // Release capture.
      const svg = svgRef.current;
      if (svg && p.pointerId !== null) {
        try {
          svg.releasePointerCapture(p.pointerId);
        } catch {
          // ignore
        }
      }

      pointer.current = {
        active: false,
        id: null,
        offsetX: 0,
        offsetY: 0,
        lastX: 0,
        lastY: 0,
        vx: 0,
        vy: 0,
        moved: 0,
        pointerId: null,
      };
      setDraggingId(null);

      // If the gesture was effectively a click, let the <Link> navigate.
      // We intentionally prevented default on pointerdown, so this is the
      // moment to synthesize navigation via the link's href.
      if (wasShortDrag && body) {
        const href = `/repo/${body.owner}/${body.name}`;
        // Use router-like behavior without pulling useRouter (keeps the
        // middle-click / cmd-click fallback on the <Link> intact — pointer
        // events don't fire for those).
        window.location.href = href;
      }

      void e;
    },
    [],
  );

  const bubbleElements = useMemo(() => {
    return seeds.map((s) => {
      const deltaLabel = `+${formatNumber(s.delta)}`;
      const showAvatar = s.r >= 26;
      const showName = s.r >= 32;
      const avatarSize = Math.min(30, Math.max(14, s.r * 0.38));
      const deltaFontSize = Math.max(9, Math.min(22, s.r * 0.3));
      const nameFontSize = Math.max(8, Math.min(13, s.r * 0.15));
      const shortName =
        s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name;
      const isDragging = draggingId === s.id;

      return (
        <g
          key={s.id}
          ref={(el) => {
            groupRefs.current[s.id] = el;
          }}
          transform={`translate(${s.cx} ${s.cy})`}
          onPointerDown={(e) => {
            e.preventDefault();
            handlePointerDown(e, s.id);
          }}
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
          aria-label={`${s.fullName} gained ${deltaLabel} stars in 24 hours (click or drag)`}
        >
          {/* Invisible oversize hit target so tiny bubbles still grab easily */}
          <circle r={Math.max(s.r, 20)} fill="transparent" />
          {/* Ambient glow */}
          <circle
            r={s.r + (isDragging ? 8 : 4)}
            fill={s.glow}
            style={{ transition: "r 180ms ease-out" }}
          />
          {/* Disk */}
          <circle
            r={s.r}
            fill={`url(#bgrad-${s.id})`}
            stroke={s.stroke}
            strokeWidth={isDragging ? 2 : 1.25}
            style={{
              transition: "stroke-width 120ms ease-out",
              filter: isDragging
                ? "drop-shadow(0 6px 18px rgba(34,197,94,0.35))"
                : undefined,
            }}
          />
          {/* Avatar */}
          {showAvatar && s.avatarUrl && (
            <image
              href={s.avatarUrl}
              x={-avatarSize / 2}
              y={-s.r * 0.34 - avatarSize / 2}
              width={avatarSize}
              height={avatarSize}
              clipPath={`url(#bclip-${s.id})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ pointerEvents: "none" }}
            />
          )}
          {/* Repo name */}
          {showName && (
            <text
              x={0}
              y={s.r * 0.05}
              textAnchor="middle"
              fill={s.textColor}
              fontSize={nameFontSize}
              fontWeight={600}
              style={{
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.01em",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {shortName}
            </text>
          )}
          {/* Delta */}
          <text
            x={0}
            y={showName ? s.r * 0.36 : s.r * 0.12}
            textAnchor="middle"
            fill={s.textColor}
            fontSize={deltaFontSize}
            fontWeight={700}
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {deltaLabel}
          </text>
        </g>
      );
    });
  }, [seeds, draggingId, handlePointerDown]);

  return (
    <section
      aria-label="Trending bubble map — drag to rearrange, click to open"
      className="relative mb-6 rounded-card border border-border-primary bg-bg-card/60 overflow-hidden"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${seeds.length} trending repos by 24h star gain — drag any bubble to rearrange`}
        className="block select-none"
        style={{
          aspectRatio: `${width} / ${height}`,
          touchAction: "none",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          {seeds.map((s) => (
            <radialGradient
              key={`bg-${s.id}`}
              id={`bgrad-${s.id}`}
              cx="35%"
              cy="30%"
              r="75%"
            >
              <stop offset="0%" stopColor={s.fill} stopOpacity={1} />
              <stop offset="100%" stopColor={s.fill} stopOpacity={0.82} />
            </radialGradient>
          ))}
          {seeds.map((s) => {
            const avatarSize = Math.min(30, Math.max(14, s.r * 0.38));
            return (
              <clipPath key={`clip-${s.id}`} id={`bclip-${s.id}`}>
                <circle cx={0} cy={-s.r * 0.34} r={avatarSize / 2} />
              </clipPath>
            );
          })}
        </defs>
        {bubbleElements}
      </svg>
    </section>
  );
}
