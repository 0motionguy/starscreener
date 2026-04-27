"use client";

// Client physics renderer for the SUBREDDIT mindshare map.
//
// Visual encoding:
//   fill ......... MOMENTUM tier (breakout / heating / stable / cooling)
//   ring ......... breakout intensity (Reddit orange when ≥1 breakout)
//   size ......... activity score (log10 by default, linear opt-in)
//
// Click a bubble → set ?sub=X on the URL.
//
// Animation strategy:
//   • cx / cy → driven by the EXISTING physics engine. On window/scale
//     toggle we set per-body `targetCx/targetCy` and add a spring-pull
//     force in the step loop; bubbles glide to their new packed positions
//     over ~40 frames. This avoids fighting framer-motion's CSS-transform
//     writes on motion.g elements (they would override the SVG `transform`
//     attribute we use for physics).
//   • r → animated via `motion.circle r={...}`. `r` is a true SVG attribute
//     (not a transform), so framer + physics don't collide. `r` is the
//     attribute that visibly captures volatility (a bubble doubling in
//     size on toggle = the "this sub really moved" signal).

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { BubbleTooltip, type BubbleTooltipData } from "./BubbleTooltip";
import {
  usePhysicsBubbles,
  type PhysicsBody,
} from "@/hooks/usePhysicsBubbles";

export type SubredditWindowKey = "24h" | "7d";
export type ScaleMode = "log" | "linear";

export interface SubredditSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  subreddit: string;
  activityScore: number;
  breakoutCount: number;
  aboveAvgCount: number;
  totalPosts: number;
  /** 24h activity / (7d activity / 7). 1 = stable, >1 = heating. */
  momentumRatio: number;
  /** Bubble fill — momentum-tier color (inner gradient stop). */
  fill: string;
  /** Outer gradient stop — gives the bubble real lift. */
  gradientEnd: string;
  /** Inner glow halo color. */
  glow: string;
  /** Ring stroke color — Reddit orange when breakouts present, else neutral. */
  stroke: string;
  /** Ring stroke width in px — 1/1.5/2 by breakout count. */
  strokeWidth: number;
  /** Bubble label text color. */
  textColor: string;
  /** Up to 3 top post titles for tooltip (already truncated to 60 chars). */
  topPostTitles: string[];
  /** 7-bin daily activity for tooltip sparkline (oldest → newest). */
  sparkline7d: number[];
}

export type SubredditWindowSeedSet = Record<
  SubredditWindowKey,
  { log: SubredditSeed[]; linear: SubredditSeed[] }
>;

interface SubredditMindshareCanvasProps {
  windows: SubredditWindowSeedSet;
  width: number;
  height: number;
}

const WINDOW_TABS: Array<{ key: SubredditWindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
];

const SCALE_TABS: Array<{ key: ScaleMode; label: string }> = [
  { key: "log", label: "LOG" },
  { key: "linear", label: "LIN" },
];

// Two-color legend — orange = breakout intensity, green = the heating/stable
// momentum band. Used by the static legend pills at the top of the canvas.
const LEGEND_GREEN = "#22c55e";
const LEGEND_ORANGE = "#ff4500";

// Every rendered bubble gets an identity label — unlabeled grey circles
// read as "broken data" rather than "quiet subreddit". Small bubbles use
// the outside-connector strategy; large ones render name + value inside.
// Inside-bubble names widen to 16 chars so r/MachineLearning, r/PromptEng..,
// r/GoogleGemin.. etc. don't get truncated mid-common-word.
const INSIDE_NAME_MAX_CHARS = 16;

// Bubble-label layout constants (used by both the outsideLayout pass below
// and the per-bubble BubbleNode). Hoisted to module scope so the memo'd
// BubbleNode can read them without a closure on the parent.
const INSIDE_LABEL_R = 24; // diameter 48px+
const NAME_FONT_OUTSIDE = 10;
const NAME_CHAR_W_OUTSIDE = 5.6; // mono approx at 10px
const OUTSIDE_PAD = 6;
const OUTSIDE_NAME_H = 12;

type OutsidePos = {
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  anchor: "start" | "end" | "middle";
  bbox: { x1: number; y1: number; x2: number; y2: number };
  text: string;
};

// ---------------------------------------------------------------------------
// BubbleNode — memo'd per-bubble JSX.
//
// Pulled out of an inline seeds.map (UI-03). The previous structure had
// hoveredId/draggingId in the bubbleElements useMemo deps, so every hover
// rebuilt + re-rendered all 50+ bubbles. With React.memo, the parent's map
// still allocates 50 React elements per hover (acceptable), but only the
// newly-hovered + previously-hovered bubbles actually run their render
// function — the other ~48 short-circuit on shallow prop equality.
//
// Defined at module scope so the component identity is stable across parent
// renders (which is what makes memo work).
// ---------------------------------------------------------------------------

interface BubbleNodeProps {
  seed: SubredditSeed;
  gradientId: string;
  isHovered: boolean;
  isDragging: boolean;
  isActive: boolean;
  isLabeled: boolean;
  outside: OutsidePos | null | undefined;
  /** Refs from the parent's usePhysicsBubbles. Stable across renders. */
  groupRefs: MutableRefObject<Record<string, SVGGElement | null>>;
  bodies: MutableRefObject<
    ReadonlyArray<SubredditSeed & { cx: number; cy: number; subreddit: string }>
  >;
  /** Pointer handlers (already useCallback'd by the caller). */
  onPointerDown: (e: React.PointerEvent<SVGGElement>, id: string) => void;
  onPointerEnter: (s: SubredditSeed, e: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (s: SubredditSeed, e: React.PointerEvent<SVGGElement>) => void;
  onPointerLeave: (id: string) => void;
}

const BubbleNode = memo(function BubbleNode({
  seed: s,
  gradientId,
  isHovered,
  isDragging,
  isActive,
  isLabeled,
  outside,
  groupRefs,
  bodies,
  onPointerDown,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
}: BubbleNodeProps) {
  const insideLabel = s.r >= INSIDE_LABEL_R;
  const labelFontSize = Math.max(10, Math.min(14, s.r * 0.20));
  const valueFontSize = insideLabel
    ? Math.max(11, Math.min(20, s.r * 0.25))
    : Math.max(10, Math.min(13, s.r * 0.39));
  const breakoutFontSize = Math.max(8, valueFontSize * 0.7);
  const maxLabelChars = Math.max(
    6,
    Math.min(INSIDE_NAME_MAX_CHARS, Math.round(s.r / 3.4)),
  );
  const fullLabel = `r/${s.subreddit}`;
  const shortLabel =
    fullLabel.length > maxLabelChars
      ? `${fullLabel.slice(0, maxLabelChars - 1)}…`
      : fullLabel;
  const lifted = isDragging || isHovered || isActive;
  const valueText = formatNumber(Math.round(s.activityScore));
  const showBreakoutGlyph = s.breakoutCount >= 1;

  const setRef = useCallback(
    (el: SVGGElement | null) => {
      groupRefs.current[s.id] = el;
      // Anchor to the body's CURRENT cx/cy on mount so re-parented bubbles
      // don't paint at their new target for a frame before the physics
      // spring kicks in.
      if (el) {
        const body = bodies.current.find((b) => b.subreddit === s.subreddit);
        const bx = body?.cx ?? s.cx;
        const by = body?.cy ?? s.cy;
        el.setAttribute("transform", `translate(${bx} ${by})`);
      }
    },
    [groupRefs, bodies, s.id, s.subreddit, s.cx, s.cy],
  );

  const handleDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      e.preventDefault();
      onPointerDown(e, s.id);
    },
    [onPointerDown, s.id],
  );
  const handleEnter = useCallback(
    (e: React.PointerEvent<SVGGElement>) => onPointerEnter(s, e),
    [onPointerEnter, s],
  );
  const handleMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => onPointerMove(s, e),
    [onPointerMove, s],
  );
  const handleLeave = useCallback(
    () => onPointerLeave(s.id),
    [onPointerLeave, s.id],
  );

  return (
    <g
      ref={setRef}
      onPointerDown={handleDown}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{
        cursor: isDragging ? "grabbing" : "pointer",
        touchAction: "none",
      }}
      aria-label={`Subreddit r/${s.subreddit} — activity ${Math.round(s.activityScore)}, momentum ${s.momentumRatio.toFixed(2)}x, ${s.breakoutCount} breakout posts, ${s.aboveAvgCount} above-average posts, ${s.totalPosts} total (click to filter feed)`}
    >
      <title>
        {`r/${s.subreddit} · ${valueText} activity · ${s.momentumRatio.toFixed(2)}x vs 7d avg · ${s.breakoutCount} breakout · ${s.aboveAvgCount} above-avg · ${s.totalPosts} posts`}
      </title>
      <circle r={Math.max(s.r, 22)} fill="transparent" />
      <motion.circle
        initial={false}
        animate={{ r: s.r + (lifted ? 10 : 4) }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        fill={s.glow}
      />
      <motion.circle
        initial={false}
        animate={{ r: s.r * (isHovered && !isDragging ? 1.05 : 1) }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        fill={`url(#${gradientId})`}
        stroke={isActive ? "#f6f9fc" : s.stroke}
        strokeWidth={
          isActive
            ? 2.5
            : isDragging || isHovered
              ? Math.max(s.strokeWidth, 2.25)
              : s.strokeWidth
        }
        style={{
          filter: isDragging
            ? "drop-shadow(0 6px 18px rgba(255,69,0,0.35))"
            : isHovered
              ? "drop-shadow(0 4px 10px rgba(255,69,0,0.20))"
              : undefined,
        }}
      />
      {insideLabel && isLabeled && (
        <text
          x={0}
          y={-s.r * 0.12}
          textAnchor="middle"
          fill={s.textColor}
          fontSize={labelFontSize}
          fontWeight={600}
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "-0.01em",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {shortLabel}
        </text>
      )}
      {isLabeled && (
        <g pointerEvents="none">
          <text
            x={0}
            y={insideLabel ? s.r * 0.34 : s.r * 0.12}
            textAnchor="middle"
            fill={s.textColor}
            fontSize={valueFontSize}
            fontWeight={700}
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
            }}
          >
            {valueText}
          </text>
          {showBreakoutGlyph && (
            <text
              x={0}
              y={
                (insideLabel ? s.r * 0.34 : s.r * 0.12) +
                breakoutFontSize +
                1
              }
              textAnchor="middle"
              fill="#ff6600"
              fontSize={breakoutFontSize}
              fontWeight={700}
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                userSelect: "none",
                letterSpacing: "0.02em",
              }}
            >
              {`▲ ${s.breakoutCount}`}
            </text>
          )}
        </g>
      )}
      {outside && isLabeled && (
        <g pointerEvents="none">
          <line
            x1={outside.cx}
            y1={outside.cy}
            x2={
              outside.anchor === "start"
                ? outside.tx - 2
                : outside.anchor === "end"
                  ? outside.tx + 2
                  : outside.tx
            }
            y2={
              outside.anchor === "middle"
                ? outside.cy < 0
                  ? outside.ty + OUTSIDE_NAME_H * 0.5
                  : outside.ty - OUTSIDE_NAME_H * 0.9
                : outside.ty
            }
            stroke="rgba(148, 163, 184, 0.45)"
            strokeWidth={1}
          />
          <text
            x={outside.tx}
            y={outside.ty}
            textAnchor={outside.anchor}
            dominantBaseline="middle"
            fill="#cbd5e1"
            fontSize={NAME_FONT_OUTSIDE}
            fontWeight={600}
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "-0.01em",
              userSelect: "none",
              paintOrder: "stroke",
              stroke: "rgba(15, 23, 42, 0.85)",
              strokeWidth: 3,
              strokeLinejoin: "round",
            }}
          >
            {outside.text}
          </text>
        </g>
      )}
    </g>
  );
});

export function SubredditMindshareCanvas({
  windows,
  width,
  height,
}: SubredditMindshareCanvasProps) {
  const defaultTab: SubredditWindowKey =
    windows["24h"].log.length > 0 ? "24h" : "7d";
  const [activeTab, setActiveTab] = useState<SubredditWindowKey>(defaultTab);
  // Log is the recommended default — solves the
  // r/ChatGPT-dwarfs-everything problem on the 7d window.
  const [scale, setScale] = useState<ScaleMode>("log");

  const seeds = windows[activeTab][scale];

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSub = searchParams.get("sub");

  // Legend counts — total breakout posts and above-avg posts visible across
  // all bubbles. Communicates "how much heat is on screen right now."
  const legendCounts = useMemo(() => {
    let breakoutPosts = 0;
    let aboveAvgPosts = 0;
    for (const s of seeds) {
      breakoutPosts += s.breakoutCount;
      aboveAvgPosts += s.aboveAvgCount;
    }
    return { breakoutPosts, aboveAvgPosts };
  }, [seeds]);

  // Gradient defs keyed on the (fill, gradientEnd) tier color pair instead
  // of per-seed id. The 80 seeds use ~4 unique tier colors, so this collapses
  // ~80 <radialGradient> elements into ~4 — every bubble references the
  // shared def via gradientIdBySeedId.
  const gradients = useMemo(() => {
    const byKey = new Map<
      string,
      { id: string; fill: string; gradientEnd: string }
    >();
    const idBySeed = new Map<string, string>();
    for (const s of seeds) {
      const key = `${s.fill}|${s.gradientEnd}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          id: `sgrad-${byKey.size}`,
          fill: s.fill,
          gradientEnd: s.gradientEnd,
        };
        byKey.set(key, entry);
      }
      idBySeed.set(s.id, entry.id);
    }
    return { defs: Array.from(byKey.values()), idBySeed };
  }, [seeds]);

  // Local seed type carrying targetCx/targetCy so the hook's optional
  // target-pull spring fires during window/scale re-pack.
  type SubredditSeedWithTarget = SubredditSeed & {
    targetCx: number;
    targetCy: number;
  };

  // Wrap raw seeds with targetCx/Cy initialized to cx/cy so the hook's
  // initial-bodies path picks them up.
  const seedsWithTarget = useMemo<SubredditSeedWithTarget[]>(
    () => seeds.map((s) => ({ ...s, targetCx: s.cx, targetCy: s.cy })),
    [seeds],
  );

  // Position-preserving reset: subs present in both old and new sets keep
  // their previous cx/cy so the spring-pull toward the new target produces
  // a visible glide instead of a teleport.
  const preservePositions = useCallback(
    (
      prev: PhysicsBody<SubredditSeedWithTarget>[],
      next: SubredditSeedWithTarget[],
    ): PhysicsBody<SubredditSeedWithTarget>[] => {
      const prevBySub = new Map(prev.map((b) => [b.subreddit, b]));
      return next.map((s) => {
        const old = prevBySub.get(s.subreddit);
        if (old) {
          return {
            ...s,
            cx: old.cx,
            cy: old.cy,
            vx: 0,
            vy: 0,
            held: false,
            targetCx: s.cx,
            targetCy: s.cy,
          };
        }
        return { ...s, vx: 0, vy: 0, held: false };
      });
    },
    [],
  );

  // Physics + pointer wiring lives in usePhysicsBubbles (UI-04). Click
  // toggles the ?sub=<subreddit> URL param.
  const {
    svgRef,
    groupRefs,
    bodies,
    draggingId,
    handlePointerDown: rawHandlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePhysicsBubbles<SubredditSeedWithTarget>({
    seeds: seedsWithTarget,
    width,
    height,
    resetBodies: preservePositions,
    wakeOnSeedChange: true,
    onClick: (seed) => {
      const params = new URLSearchParams(searchParams.toString());
      if (activeSub === seed.subreddit) {
        params.delete("sub");
      } else {
        params.set("sub", seed.subreddit);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
  });

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Tooltip is positioned in viewport coords; visibility tracks hover/drag.
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: BubbleTooltipData | null;
  }>({ visible: false, x: 0, y: 0, data: null });

  // Wrap pointer-down so we can hide the tooltip on drag start. The hook's
  // physics handling stays untouched.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, id: string) => {
      setTooltip((t) => ({ ...t, visible: false }));
      rawHandlePointerDown(e, id);
    },
    [rawHandlePointerDown],
  );

  // ──────────────────────────────────────────────────────────────────────
  // LABEL STRATEGY:
  //   Only the top TOP_LABELED_COUNT bubbles by radius show a label idle.
  //   The remainder stay clean until hovered — at which point the rich
  //   tooltip surfaces every detail.
  //
  //   Of the top-N labeled set:
  //     • r >= INSIDE_LABEL_R → name + activity rendered INSIDE the bubble
  //     • r <  INSIDE_LABEL_R → activity inside, name OUTSIDE with a
  //                              connector line, positioned via greedy
  //                              collision pass against ALL bubbles
  // ──────────────────────────────────────────────────────────────────────

  // Previously gated on top-N by radius, which left smaller bubbles as
  // anonymous grey circles. Label every seed so the map reads as data,
  // not decoration. The inside/outside strategy below still decides
  // WHERE the label goes based on bubble size.
  const labeledIds = useMemo(
    () => new Set(seeds.map((s) => s.id)),
    [seeds],
  );

  const outsideLayout = useMemo(() => {
    const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const bubbleBoxes = seeds.map((s) => ({
      x1: s.cx - s.r,
      y1: s.cy - s.r,
      x2: s.cx + s.r,
      y2: s.cy + s.r,
    }));

    const result: Record<string, OutsidePos | null> = {};
    const order = [...seeds].sort((a, b) => b.r - a.r);

    const overlaps = (
      a: { x1: number; y1: number; x2: number; y2: number },
      b: { x1: number; y1: number; x2: number; y2: number },
    ) => !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);

    for (const s of order) {
      // Skip bubbles outside the labeled set entirely.
      if (!labeledIds.has(s.id)) {
        result[s.id] = null;
        continue;
      }
      if (s.r >= INSIDE_LABEL_R) {
        result[s.id] = null;
        continue;
      }
      const fullName = `r/${s.subreddit}`;
      const maxChars = 16;
      const displayName =
        fullName.length > maxChars
          ? `${fullName.slice(0, maxChars - 1)}…`
          : fullName;
      const textW = displayName.length * NAME_CHAR_W_OUTSIDE;
      const halfH = OUTSIDE_NAME_H / 2;

      const candidates: Array<Omit<OutsidePos, "bbox" | "text">> = [
        { cx: s.r, cy: 0, tx: s.r + OUTSIDE_PAD, ty: 0, anchor: "start" },
        { cx: -s.r, cy: 0, tx: -(s.r + OUTSIDE_PAD), ty: 0, anchor: "end" },
        {
          cx: 0,
          cy: -s.r,
          tx: 0,
          ty: -(s.r + OUTSIDE_PAD + halfH * 0.4),
          anchor: "middle",
        },
        {
          cx: 0,
          cy: s.r,
          tx: 0,
          ty: s.r + OUTSIDE_PAD + halfH * 1.6,
          anchor: "middle",
        },
      ];

      let chosen: OutsidePos | null = null;
      for (const c of candidates) {
        let bx1: number;
        let bx2: number;
        if (c.anchor === "start") {
          bx1 = s.cx + c.tx;
          bx2 = bx1 + textW;
        } else if (c.anchor === "end") {
          bx2 = s.cx + c.tx;
          bx1 = bx2 - textW;
        } else {
          bx1 = s.cx + c.tx - textW / 2;
          bx2 = s.cx + c.tx + textW / 2;
        }
        const by1 = s.cy + c.ty - halfH;
        const by2 = s.cy + c.ty + halfH;

        if (bx1 < 4 || bx2 > width - 4 || by1 < 4 || by2 > height - 4) continue;

        const candidateBox = { x1: bx1, y1: by1, x2: bx2, y2: by2 };

        let hitsBubble = false;
        for (let k = 0; k < bubbleBoxes.length; k++) {
          if (seeds[k].id === s.id) continue;
          if (overlaps(candidateBox, bubbleBoxes[k])) {
            hitsBubble = true;
            break;
          }
        }
        if (hitsBubble) continue;

        let hitsLabel = false;
        for (const p of placed) {
          if (overlaps(candidateBox, p)) {
            hitsLabel = true;
            break;
          }
        }
        if (hitsLabel) continue;

        chosen = { ...c, bbox: candidateBox, text: displayName };
        placed.push(candidateBox);
        break;
      }

      if (!chosen) {
        const c = candidates[0];
        chosen = {
          ...c,
          text: displayName,
          bbox: {
            x1: s.cx + c.tx,
            y1: s.cy + c.ty - halfH,
            x2: s.cx + c.tx + textW,
            y2: s.cy + c.ty + halfH,
          },
        };
      }
      result[s.id] = chosen;
    }
    return result;
  }, [seeds, width, height, labeledIds]);

  // Tooltip helpers — clamp position so the ~280×220 card never walks off
  // the right/bottom edge of the viewport.
  const TOOLTIP_W = 280;
  const TOOLTIP_H_ESTIMATE = 220;

  const positionTooltip = useCallback(
    (clientX: number, clientY: number) => {
      const rawX = clientX + 12;
      const rawY = clientY + 12;
      const maxX =
        typeof window !== "undefined"
          ? window.innerWidth - TOOLTIP_W - 12
          : rawX;
      const maxY =
        typeof window !== "undefined"
          ? window.innerHeight - TOOLTIP_H_ESTIMATE - 12
          : rawY;
      return {
        x: Math.max(8, Math.min(maxX, rawX)),
        y: Math.max(8, Math.min(maxY, rawY)),
      };
    },
    [],
  );

  const handleBubbleEnter = useCallback(
    (s: SubredditSeed, e: React.PointerEvent<SVGGElement>) => {
      setHoveredId(s.id);
      if (draggingId !== null) return;
      const pos = positionTooltip(e.clientX, e.clientY);
      setTooltip({
        visible: true,
        x: pos.x,
        y: pos.y,
        data: {
          subreddit: s.subreddit,
          activityScore: s.activityScore,
          momentumRatio: s.momentumRatio,
          breakoutCount: s.breakoutCount,
          aboveAvgCount: s.aboveAvgCount,
          totalPosts: s.totalPosts,
          topPostTitles: s.topPostTitles,
          sparkline7d: s.sparkline7d,
        },
      });
    },
    [positionTooltip],
  );

  const handleBubbleMove = useCallback(
    (s: SubredditSeed, e: React.PointerEvent<SVGGElement>) => {
      if (draggingId !== null) return;
      const pos = positionTooltip(e.clientX, e.clientY);
      setTooltip((prev) =>
        prev.data?.subreddit === s.subreddit
          ? { ...prev, x: pos.x, y: pos.y }
          : prev,
      );
    },
    [positionTooltip],
  );

  const handleBubbleLeave = useCallback((id: string) => {
    setHoveredId((cur) => (cur === id ? null : cur));
    setTooltip((t) => ({ ...t, visible: false }));
  }, []);

  // Per-bubble JSX is wrapped in <BubbleNode> (memo'd, see top of file).
  // The map still allocates 50 React elements when hover/drag changes, but
  // shallow prop comparison short-circuits the actual render for the ~48
  // bubbles whose isHovered/isDragging didn't change.
  const bubbleElements = useMemo(() => {
    return seeds.map((s) => (
      <BubbleNode
        key={s.id}
        seed={s}
        gradientId={gradients.idBySeed.get(s.id) ?? "sgrad-0"}
        isHovered={hoveredId === s.id}
        isDragging={draggingId === s.id}
        isActive={activeSub === s.subreddit}
        isLabeled={labeledIds.has(s.id)}
        outside={outsideLayout[s.id]}
        groupRefs={groupRefs}
        bodies={bodies}
        onPointerDown={handlePointerDown}
        onPointerEnter={handleBubbleEnter}
        onPointerMove={handleBubbleMove}
        onPointerLeave={handleBubbleLeave}
      />
    ));
  }, [
    seeds,
    draggingId,
    hoveredId,
    activeSub,
    labeledIds,
    outsideLayout,
    gradients,
    groupRefs,
    bodies,
    handlePointerDown,
    handleBubbleEnter,
    handleBubbleMove,
    handleBubbleLeave,
  ]);

  return (
    <section
      aria-label="Subreddit mindshare map — drag to rearrange, click to filter feed"
      className="relative mb-4 rounded-card border border-border-primary bg-bg-card/60 overflow-hidden"
    >
      {/* Top-right control cluster: scale toggle + window toggle. */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 font-mono text-[11px]">
        <div
          className="flex items-center gap-0.5 rounded-full border border-border-primary bg-bg-card/80 backdrop-blur-sm p-0.5"
          role="tablist"
          aria-label="Size scale"
        >
          {SCALE_TABS.map((tab) => {
            const active = scale === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Use ${tab.label} bubble-size scale`}
                onClick={() => setScale(tab.key)}
                className={
                  "px-3 py-1 rounded-full transition-colors uppercase tracking-wider " +
                  (active
                    ? "bg-brand text-text-inverse font-semibold"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          className="flex items-center gap-0.5 rounded-full border border-border-primary bg-bg-card/80 backdrop-blur-sm p-0.5"
          role="tablist"
          aria-label="Time window"
        >
          {WINDOW_TABS.map((tab) => {
            const count = windows[tab.key].log.length;
            const active = activeTab === tab.key;
            const disabled = count === 0;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Show ${tab.label} window (${count} subreddits)`}
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
      </div>
      <div
        aria-label="Two-color legend"
        className="pt-11 px-3 pb-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
      >
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: LEGEND_ORANGE }}
          />
          <span className="text-text-secondary">Breakout</span>
          <span className="tabular-nums text-text-muted">
            {legendCounts.breakoutPosts}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: LEGEND_GREEN }}
          />
          <span className="text-text-secondary">Above avg</span>
          <span className="tabular-nums text-text-muted">
            {legendCounts.aboveAvgPosts}
          </span>
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${seeds.length} subreddits sized by activity, colored by momentum, ringed by breakout intensity`}
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
          {gradients.defs.map((g) => (
            <radialGradient
              key={g.id}
              id={g.id}
              cx="35%"
              cy="30%"
              r="75%"
            >
              <stop offset="0%" stopColor={g.fill} stopOpacity={0.85} />
              <stop offset="100%" stopColor={g.gradientEnd} stopOpacity={0.30} />
            </radialGradient>
          ))}
        </defs>
        {/* Render order = z-order in SVG. Push the hovered/dragged/active
            bubble to the end so its outside label and ring sit on top of
            neighbours. */}
        {(() => {
          const topId = draggingId ?? hoveredId ?? null;
          if (!topId) return bubbleElements;
          const top: typeof bubbleElements = [];
          const rest: typeof bubbleElements = [];
          for (const el of bubbleElements) {
            if (el.key === topId) top.push(el);
            else rest.push(el);
          }
          return [...rest, ...top];
        })()}
      </svg>
      <BubbleTooltip
        visible={tooltip.visible}
        x={tooltip.x}
        y={tooltip.y}
        data={tooltip.data}
      />
    </section>
  );
}
