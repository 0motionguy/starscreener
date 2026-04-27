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
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { BubbleTooltip, type BubbleTooltipData } from "./BubbleTooltip";

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

interface Body extends SubredditSeed {
  vx: number;
  vy: number;
  held: boolean;
  /** Target position the body should glide toward when seeds re-pack. */
  targetCx: number;
  targetCy: number;
}

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

const SIM = {
  centerPull: 0.00045,
  damping: 0.9,
  pairPad: 1.5,
  wallBounce: -0.35,
  flingScale: 0.5,
  idleThreshold: 0.05,
  settleFrames: 30,
  /** Spring strength toward the per-body target. Tuned so bubbles arrive
   * in ~40 frames after a toggle without overshoot wobble. */
  targetPull: 0.045,
  /** Distance under which a body is "at" its target — the pull turns off. */
  targetSnapDist: 0.5,
};

const CLICK_DRAG_THRESHOLD = 5;

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

  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Record<string, SVGGElement | null>>({});

  // Bodies hold the live (animated) cx/cy used by physics. On seed change
  // we RE-PARENT to the new seeds — for subs present in both old and new
  // sets we keep their previous cx/cy so the physics state survives the
  // toggle (otherwise there'd be no glide-from anchor). Targets receive
  // the new packed positions and the spring carries the body home.
  const bodies = useRef<Body[]>(
    seeds.map((s) => ({
      ...s,
      vx: 0,
      vy: 0,
      held: false,
      targetCx: s.cx,
      targetCy: s.cy,
    })),
  );

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Tooltip is positioned in viewport coords; visibility tracks hover/drag.
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: BubbleTooltipData | null;
  }>({ visible: false, x: 0, y: 0, data: null });

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

  const rafRef = useRef<number | null>(null);
  const idleFramesRef = useRef(0);

  const wakeSim = useCallback(() => {
    idleFramesRef.current = 0;
    if (rafRef.current !== null) return;

    const step = () => {
      const list = bodies.current;
      const n = list.length;
      let maxSpeed = 0;
      let anyHeld = false;
      let anyChasingTarget = false;

      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) {
          anyHeld = true;
          continue;
        }
        // Pull toward target (post-toggle re-pack). When the target equals
        // the live cx/cy this contributes ~0 force, so it's idle-safe.
        const tdx = a.targetCx - a.cx;
        const tdy = a.targetCy - a.cy;
        if (Math.abs(tdx) > SIM.targetSnapDist || Math.abs(tdy) > SIM.targetSnapDist) {
          a.vx += tdx * SIM.targetPull;
          a.vy += tdy * SIM.targetPull;
          anyChasingTarget = true;
        }
        a.vx += (width / 2 - a.cx) * SIM.centerPull;
        a.vy += (height / 2 - a.cy) * SIM.centerPull;
        a.vx *= SIM.damping;
        a.vy *= SIM.damping;
      }

      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) continue;
        a.cx += a.vx;
        a.cy += a.vy;
      }

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
              // both held
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
              a.vx -= nx * 0.08;
              a.vy -= ny * 0.08;
              b.vx += nx * 0.08;
              b.vy += ny * 0.08;
            }
          }
        }
      }

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

      for (let i = 0; i < n; i++) {
        const a = list[i];
        const node = groupRefs.current[a.id];
        if (!node) continue;
        const speed = Math.abs(a.vx) + Math.abs(a.vy);
        if (speed > maxSpeed) maxSpeed = speed;
        // Always render position when chasing target so the morph is visible
        // even at sub-threshold speeds.
        if (speed > SIM.idleThreshold || a.held || anyChasingTarget) {
          node.setAttribute("transform", `translate(${a.cx} ${a.cy})`);
        }
      }

      if (!anyHeld && !anyChasingTarget && maxSpeed <= SIM.idleThreshold) {
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

  // Re-parent bodies on seed change (window/scale toggle). For subs present
  // in both old and new sets we keep the previous cx/cy so the spring pull
  // toward the new target produces a visible glide. Brand-new subs land at
  // their target with zero velocity (they "appear" rather than fly in).
  useEffect(() => {
    const prev = new Map(bodies.current.map((b) => [b.subreddit, b]));
    bodies.current = seeds.map((s) => {
      const old = prev.get(s.subreddit);
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
      return {
        ...s,
        vx: 0,
        vy: 0,
        held: false,
        targetCx: s.cx,
        targetCy: s.cy,
      };
    });
    wakeSim();
  }, [seeds, wakeSim]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, id: string) => {
      const coords = toSvgCoords(e.clientX, e.clientY);
      if (!coords) return;
      const body = bodies.current.find((b) => b.id === id);
      if (!body) return;
      const svg = svgRef.current;
      if (svg) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          // ignore
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
      // Cancel target-pull while dragging — user is in control.
      body.targetCx = body.cx;
      body.targetCy = body.cy;
      setDraggingId(id);
      setTooltip((t) => ({ ...t, visible: false }));
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
      const dx = coords.x - p.lastX;
      const dy = coords.y - p.lastY;
      p.vx = dx;
      p.vy = dy;
      p.lastX = coords.x;
      p.lastY = coords.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      body.cx = coords.x + p.offsetX;
      body.cy = coords.y + p.offsetY;
      body.targetCx = body.cx;
      body.targetCy = body.cy;
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
        wakeSim();
      }

      const wasShortDrag = p.moved < CLICK_DRAG_THRESHOLD;

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

      if (wasShortDrag && body) {
        const params = new URLSearchParams(searchParams.toString());
        if (activeSub === body.subreddit) {
          params.delete("sub");
        } else {
          params.set("sub", body.subreddit);
        }
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }

      void e;
    },
    [wakeSim, activeSub, searchParams, router, pathname],
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
  const INSIDE_LABEL_R = 24; // diameter 48px+
  const NAME_FONT_OUTSIDE = 10;
  const NAME_CHAR_W_OUTSIDE = 5.6; // mono approx at 10px
  const OUTSIDE_PAD = 6;
  const OUTSIDE_NAME_H = 12;

  // Previously gated on top-N by radius, which left smaller bubbles as
  // anonymous grey circles. Label every seed so the map reads as data,
  // not decoration. The inside/outside strategy below still decides
  // WHERE the label goes based on bubble size.
  const labeledIds = useMemo(
    () => new Set(seeds.map((s) => s.id)),
    [seeds],
  );

  type OutsidePos = {
    cx: number;
    cy: number;
    tx: number;
    ty: number;
    anchor: "start" | "end" | "middle";
    bbox: { x1: number; y1: number; x2: number; y2: number };
    text: string;
  };

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
      if (pointer.current.active) return;
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
      if (pointer.current.active) return;
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

  const bubbleElements = useMemo(() => {
    return seeds.map((s) => {
      const insideLabel = s.r >= INSIDE_LABEL_R;
      const isLabeled = labeledIds.has(s.id);
      const labelFontSize = Math.max(10, Math.min(14, s.r * 0.20));
      // Bumped value font: bolder + ~15% larger than before for readability.
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
      const isDragging = draggingId === s.id;
      const isHovered = hoveredId === s.id;
      const isActive = activeSub === s.subreddit;
      const lifted = isDragging || isHovered || isActive;

      const outside = outsideLayout[s.id];
      const valueText = formatNumber(Math.round(s.activityScore));
      const showBreakoutGlyph = s.breakoutCount >= 1;

      return (
        <g
          key={s.id}
          ref={(el) => {
            groupRefs.current[s.id] = el;
            // Anchor to the body's CURRENT cx/cy on mount so re-parented
            // bubbles don't paint at their new target for a frame before
            // the physics spring kicks in. Falls back to seed cx/cy for
            // brand-new bubbles (no prior body to inherit from).
            if (el) {
              const body = bodies.current.find((b) => b.subreddit === s.subreddit);
              const bx = body?.cx ?? s.cx;
              const by = body?.cy ?? s.cy;
              el.setAttribute("transform", `translate(${bx} ${by})`);
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            handlePointerDown(e, s.id);
          }}
          onPointerEnter={(e) => handleBubbleEnter(s, e)}
          onPointerMove={(e) => handleBubbleMove(s, e)}
          onPointerLeave={() => handleBubbleLeave(s.id)}
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
            fill={`url(#${gradients.idBySeed.get(s.id) ?? "sgrad-0"})`}
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
  }, [
    seeds,
    draggingId,
    hoveredId,
    activeSub,
    handlePointerDown,
    handleBubbleEnter,
    handleBubbleMove,
    handleBubbleLeave,
    outsideLayout,
    labeledIds,
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
