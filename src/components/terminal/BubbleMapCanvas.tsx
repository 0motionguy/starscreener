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
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";

// Stable lookup for the legend strip.
const CATEGORY_META = new Map(
  CATEGORIES.map((c) => [c.id, { name: c.shortName || c.name, color: c.color }]),
);

export type WindowKey = "24h" | "7d" | "30d";

export interface BubbleSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  delta: number;
  /** Which window this seed was packed for. */
  deltaWindow: WindowKey;
  fullName: string;
  name: string;
  owner: string;
  avatarUrl: string;
  categoryId: string;
  fill: string;
  stroke: string;
  glow: string;
  textColor: string;
}

/** One pack per window — the canvas switches between them via tab state. */
export type WindowSeedSet = Record<WindowKey, BubbleSeed[]>;

interface Body extends BubbleSeed {
  vx: number;
  vy: number;
  /** When >0, this body is anchored (being dragged or recently released). */
  held: boolean;
}

interface BubbleMapCanvasProps {
  windows: WindowSeedSet;
  width: number;
  height: number;
}

const WINDOW_TABS: Array<{ key: WindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

const SIM = {
  centerPull: 0.00045,
  damping: 0.9,
  pairPad: 1.5,
  wallBounce: -0.35,
  /** Pointer-velocity multiplier on release (fling strength). */
  flingScale: 0.5,
  /** Max total speed below which we consider a body idle this frame. */
  idleThreshold: 0.05,
  /**
   * Number of consecutive frames with EVERY body's speed under
   * `idleThreshold` before we cancel the rAF loop. At 60fps, 30 frames
   * ≈ 500ms — long enough to outlast a fling, short enough that the CPU
   * goes back to zero promptly.
   */
  settleFrames: 30,
};

/**
 * Low-drag threshold: pointer traveled less than this → treat as click.
 * In the same coordinate space as the SVG (pre-scale), so drags that are
 * ≤ 4 CSS px still register as a click when the viewBox is scaled down.
 */
const CLICK_DRAG_THRESHOLD = 5;

export function BubbleMapCanvas({ windows, width, height }: BubbleMapCanvasProps) {
  const router = useRouter();
  // Default to the first window that has any bubbles, so the map never
  // opens on an empty canvas.
  const defaultTab: WindowKey =
    windows["24h"].length > 0
      ? "24h"
      : windows["7d"].length > 0
        ? "7d"
        : "30d";
  const [activeTab, setActiveTab] = useState<WindowKey>(defaultTab);

  const seeds = windows[activeTab];

  // Legend = unique categoryIds present in the current view, sorted by
  // how many bubbles each category contributes (biggest slice first).
  // Rendered under the tabs so the color code is self-documenting.
  const legendEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => {
        const meta = CATEGORY_META.get(id);
        return {
          id,
          count,
          name: meta?.name ?? id,
          color: meta?.color ?? "#22c55e",
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [seeds]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Record<string, SVGGElement | null>>({});
  const bodies = useRef<Body[]>(
    seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false })),
  );

  // Keep the body array in sync when the seed list changes (e.g. the
  // user switches tab or the hourly trending refresh re-renders the
  // parent). Tab switch is a full reset — we want the new window's
  // positions, not a lerp from the previous. Ids that persist keep no
  // velocity, so the tab change reads as "snap to new state."
  //
  // We intentionally do NOT wake the sim here: the seed positions are
  // already a valid packed layout, so the new tab snaps to rest. The
  // loop only starts on real user interaction (drag/fling) below.
  useEffect(() => {
    bodies.current = seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false }));
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
  //
  // The seed positions handed to the canvas already come from a deterministic
  // circle-pack on the server, so on first mount the bubbles are ready to
  // render statically — no perpetual drift toward center, no O(n²) collision
  // work on cold load. The loop is only kicked off via `wakeSim()` when the
  // user actually interacts (drag, fling, tab switch) and auto-cancels itself
  // once every body has stayed under `idleThreshold` for `settleFrames`.
  const rafRef = useRef<number | null>(null);
  const idleFramesRef = useRef(0);

  const wakeSim = useCallback(() => {
    // Reset the idle-frame counter so any in-flight cancellation plan is
    // pushed back, then start the loop if nothing is running.
    idleFramesRef.current = 0;
    if (rafRef.current !== null) return;

    const step = () => {
      const list = bodies.current;
      const n = list.length;
      let maxSpeed = 0;
      let anyHeld = false;

      // 1. Apply forces (center gravity + damping).
      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) {
          anyHeld = true;
          continue;
        }
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
        if (speed > maxSpeed) maxSpeed = speed;
        if (speed > SIM.idleThreshold || a.held) {
          node.setAttribute("transform", `translate(${a.cx} ${a.cy})`);
        }
      }

      // 6. Auto-stop: once no one is held and every body is under the idle
      //    threshold for `settleFrames` consecutive frames, cancel rAF.
      if (!anyHeld && maxSpeed <= SIM.idleThreshold) {
        idleFramesRef.current += 1;
      } else {
        idleFramesRef.current = 0;
      }
      if (idleFramesRef.current >= SIM.settleFrames) {
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [width, height]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

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
      wakeSim();
    },
    [toSvgCoords, wakeSim],
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
      // Keep the sim awake while the pointer is moving so neighbor
      // collisions resolve live as the user drags through them.
      wakeSim();
    },
    [toSvgCoords, wakeSim],
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
        // Fling + re-pack neighbors — then the loop auto-stops on settle.
        wakeSim();
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

      // If the gesture was effectively a click, navigate. Pointerdown
      // already preventDefault'd so cmd/ctrl/middle-click never reach this
      // path anyway — the comment on the prior `window.location.href = href`
      // claimed they did, but they don't (pointerdown blocks the native
      // anchor activation). Using `router.push` keeps Next's prefetch +
      // scroll restoration + transition state consistent with the rest of
      // the app.
      if (wasShortDrag && body) {
        const href = `/repo/${body.owner}/${body.name}`;
        router.push(href);
      }

      void e;
    },
    [wakeSim, router],
  );

  const bubbleElements = useMemo(() => {
    return seeds.map((s) => {
      // Label is "+N" for 24h, "+N/7d" or "+N/30d" otherwise so the user
      // always knows what window the number represents.
      // Tab state enforces one window at a time — label is always
      // just "+N" without a window suffix.
      const deltaLabel = `+${formatNumber(s.delta)}`;
      // Even the smallest pack bubbles now fit a short truncated name,
      // so the map is legible at a glance without hovering. Avatar is
      // still avatar-sized-down on anything under r=24.
      const showAvatar = s.r >= 24;
      const showName = s.r >= 18;
      const avatarSize = Math.min(30, Math.max(12, s.r * 0.36));
      const deltaFontSize = Math.max(9, Math.min(22, s.r * 0.3));
      const nameFontSize = Math.max(8, Math.min(13, s.r * 0.2));
      // Truncation length scales with bubble radius — tiny bubbles get a
      // tight 6-char cut, larger ones show up to 14.
      const maxNameChars = Math.max(6, Math.min(14, Math.round(s.r / 5.5)));
      const shortName =
        s.name.length > maxNameChars
          ? `${s.name.slice(0, maxNameChars - 1)}…`
          : s.name;
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
          aria-label={`${s.fullName} gained ${deltaLabel} stars over ${s.deltaWindow} (click or drag)`}
        >
          {/* Invisible oversize hit target so tiny bubbles still grab easily */}
          <circle r={Math.max(s.r, 20)} fill="transparent" />
          {/* Ambient glow */}
          <circle
            r={s.r + (isDragging ? 8 : 4)}
            fill={s.glow}
            style={{ transition: "r 180ms ease-out" }}
          />
          {/* Disk — faint gradient (stops 0.35 → 0.12) with a slightly
              thicker stroke carrying category identity. The bubble field
              now recedes into the page instead of competing with brand
              orange + Featured cards + delta greens. */}
          <circle
            r={s.r}
            fill={`url(#bgrad-${s.id})`}
            stroke={s.stroke}
            strokeWidth={isDragging ? 2.25 : 1.5}
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
      className="relative mb-4 rounded-card border border-border-primary bg-bg-card/60 overflow-hidden"
    >
      {/* Window tabs — overlaid in the top-right corner so the canvas
          stays the focus. Absolute-positioned so they float above the
          SVG without consuming vertical space. */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-full border border-border-primary bg-bg-card/80 backdrop-blur-sm p-0.5 font-mono text-[11px]"
        role="tablist"
        aria-label="Time window"
      >
        {WINDOW_TABS.map((tab) => {
          const count = windows[tab.key].length;
          const active = activeTab === tab.key;
          const disabled = count === 0;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`Show ${tab.label} window (${count} repos)`}
              disabled={disabled}
              onClick={() => setActiveTab(tab.key)}
              className={
                "px-3 py-1 rounded-full transition-colors uppercase tracking-wider " +
                (active
                  ? "bg-brand text-text-inverse font-semibold"
                  : disabled
                    ? "text-text-muted cursor-not-allowed"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {/* Category legend — sits below the floating tab pills, above the
          canvas. Shows only the categories actually present in the
          current (filtered + windowed) view, with a color swatch
          matching the bubble fill so users can decode the map at a
          glance. Count per category is tabular-nums so row wraps
          stay tidy. */}
      {legendEntries.length > 0 && (
        <div
          aria-label="Category legend"
          className="pt-11 px-3 pb-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
        >
          {legendEntries.map((entry) => (
            <span
              key={entry.id}
              className="inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-text-secondary">{entry.name}</span>
              <span className="tabular-nums text-text-muted">
                {entry.count}
              </span>
            </span>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${seeds.length} trending repos by ${activeTab} star gain — drag any bubble to rearrange`}
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
              <stop offset="0%" stopColor={s.fill} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.fill} stopOpacity={0.12} />
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
