"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

// ---------------------------------------------------------------------------
// Shared physics-bubble runtime — extracted from BubbleMapCanvas,
// SubredditMindshareCanvas, and TopicMindshareCanvas (UI-04). Manages bodies,
// pointer capture, the rAF auto-stop loop, and click-vs-drag detection. Each
// canvas only renders its own bubble JSX and supplies its own onClick.
// ---------------------------------------------------------------------------

/** Minimum shape every seed must satisfy. */
export interface PhysicsSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  /** Optional spring target — when present and != live cx/cy a per-body pull fires. */
  targetCx?: number;
  targetCy?: number;
}

/** Internal body shape — seed extended with mutable physics state. */
export type PhysicsBody<T extends PhysicsSeed> = T & {
  vx: number;
  vy: number;
  held: boolean;
};

export interface PhysicsSimConfig {
  centerPull: number;
  damping: number;
  pairPad: number;
  wallBounce: number;
  flingScale: number;
  idleThreshold: number;
  settleFrames: number;
  /** Spring strength toward per-body target (only fires if seed has targetCx/Cy). */
  targetPull: number;
  /** Distance under which the target pull turns off. */
  targetSnapDist: number;
}

const DEFAULT_SIM: PhysicsSimConfig = {
  centerPull: 0.00045,
  damping: 0.9,
  pairPad: 1.5,
  wallBounce: -0.35,
  flingScale: 0.5,
  idleThreshold: 0.05,
  settleFrames: 30,
  targetPull: 0.045,
  targetSnapDist: 0.5,
};

const CLICK_DRAG_THRESHOLD = 5;

export interface UsePhysicsBubblesOptions<T extends PhysicsSeed> {
  seeds: T[];
  width: number;
  height: number;
  /** Optional partial overrides for SIM defaults. */
  sim?: Partial<PhysicsSimConfig>;
  /**
   * Called after pointer-up when the gesture qualifies as a click (pointer
   * traveled less than CLICK_DRAG_THRESHOLD). Receives the seed, not the
   * mutable body.
   */
  onClick?: (seed: T) => void;
  /**
   * Optional reset strategy when `seeds` changes. Default rebuilds bodies
   * from the new seed list with vx=vy=0 (snap to new layout). Subreddit
   * canvas overrides to preserve previous positions for repeated ids.
   */
  resetBodies?: (prev: PhysicsBody<T>[], seeds: T[]) => PhysicsBody<T>[];
  /**
   * If true, wake the sim after a seed-driven reset so the spring layout
   * runs to settle. Defaults false (the prior layout is already packed).
   */
  wakeOnSeedChange?: boolean;
}

export interface UsePhysicsBubblesResult<T extends PhysicsSeed> {
  svgRef: RefObject<SVGSVGElement | null>;
  groupRefs: MutableRefObject<Record<string, SVGGElement | null>>;
  /** Live bodies — read-only for callers; mutated internally. */
  bodies: MutableRefObject<PhysicsBody<T>[]>;
  draggingId: string | null;
  handlePointerDown: (
    e: ReactPointerEvent<SVGGElement>,
    id: string,
  ) => void;
  handlePointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
  /** Wake the sim. Call after manual body mutations. */
  wakeSim: () => void;
}

function defaultReset<T extends PhysicsSeed>(
  _prev: PhysicsBody<T>[],
  seeds: T[],
): PhysicsBody<T>[] {
  return seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false }));
}

export function usePhysicsBubbles<T extends PhysicsSeed>(
  opts: UsePhysicsBubblesOptions<T>,
): UsePhysicsBubblesResult<T> {
  const {
    seeds,
    width,
    height,
    sim: simOverride,
    onClick,
    resetBodies = defaultReset,
    wakeOnSeedChange = false,
  } = opts;

  const sim = useMemo<PhysicsSimConfig>(
    () => ({ ...DEFAULT_SIM, ...simOverride }),
    [simOverride],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Record<string, SVGGElement | null>>({});
  const bodies = useRef<PhysicsBody<T>[]>(
    seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false })),
  );

  // Latest callbacks captured in refs so the seed-change effect doesn't
  // re-run when consumers pass inline arrows.
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const resetRef = useRef(resetBodies);
  resetRef.current = resetBodies;

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

      // 1. Apply forces (target pull + center gravity + damping).
      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (a.held) {
          anyHeld = true;
          continue;
        }
        const tcx = a.targetCx;
        const tcy = a.targetCy;
        if (tcx !== undefined && tcy !== undefined) {
          const tdx = tcx - a.cx;
          const tdy = tcy - a.cy;
          if (
            Math.abs(tdx) > sim.targetSnapDist ||
            Math.abs(tdy) > sim.targetSnapDist
          ) {
            a.vx += tdx * sim.targetPull;
            a.vy += tdy * sim.targetPull;
            anyChasingTarget = true;
          }
        }
        a.vx += (width / 2 - a.cx) * sim.centerPull;
        a.vy += (height / 2 - a.cy) * sim.centerPull;
        a.vx *= sim.damping;
        a.vy *= sim.damping;
      }

      // 2. Integrate.
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
          const min = a.r + b.r + sim.pairPad;
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
          a.vx *= sim.wallBounce;
        } else if (a.cx > width - a.r) {
          a.cx = width - a.r;
          a.vx *= sim.wallBounce;
        }
        if (a.cy < a.r) {
          a.cy = a.r;
          a.vy *= sim.wallBounce;
        } else if (a.cy > height - a.r) {
          a.cy = height - a.r;
          a.vy *= sim.wallBounce;
        }
      }

      // 5. Write transforms — only when meaningfully moved or chasing target.
      for (let i = 0; i < n; i++) {
        const a = list[i];
        const node = groupRefs.current[a.id];
        if (!node) continue;
        const speed = Math.abs(a.vx) + Math.abs(a.vy);
        if (speed > maxSpeed) maxSpeed = speed;
        if (speed > sim.idleThreshold || a.held || anyChasingTarget) {
          node.setAttribute("transform", `translate(${a.cx} ${a.cy})`);
        }
      }

      // 6. Auto-stop.
      if (
        !anyHeld &&
        !anyChasingTarget &&
        maxSpeed <= sim.idleThreshold
      ) {
        idleFramesRef.current += 1;
      } else {
        idleFramesRef.current = 0;
      }
      if (idleFramesRef.current >= sim.settleFrames) {
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [width, height, sim]);

  // Re-parent bodies on seed change. Default snaps to new layout; consumers
  // can override via `resetBodies` to preserve positions for repeated ids.
  useEffect(() => {
    bodies.current = resetRef.current(bodies.current, seeds);
    if (wakeOnSeedChange) wakeSim();
  }, [seeds, wakeOnSeedChange, wakeSim]);

  // Cancel the rAF loop on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>, id: string) => {
      const coords = toSvgCoords(e.clientX, e.clientY);
      if (!coords) return;
      const body = bodies.current.find((b) => b.id === id);
      if (!body) return;

      const svg = svgRef.current;
      if (svg) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          // some browsers dislike capturing on SVG root — ignore
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
      // Cancel any in-flight target-pull so the body doesn't snap back to
      // its old packed position when released. Bodies without targets are
      // untouched.
      if (body.targetCx !== undefined) body.targetCx = body.cx;
      if (body.targetCy !== undefined) body.targetCy = body.cy;
      setDraggingId(id);
      wakeSim();
    },
    [toSvgCoords, wakeSim],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
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
      // Target tracks the live position during drag — release should leave
      // the body where the user dropped it.
      if (body.targetCx !== undefined) body.targetCx = body.cx;
      if (body.targetCy !== undefined) body.targetCy = body.cy;
      wakeSim();
    },
    [toSvgCoords, wakeSim],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const p = pointer.current;
      if (!p.active || !p.id) return;
      const body = bodies.current.find((b) => b.id === p.id);
      if (body) {
        body.held = false;
        body.vx = p.vx * sim.flingScale;
        body.vy = p.vy * sim.flingScale;
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
        const seed = seeds.find((s) => s.id === body.id);
        if (seed) onClickRef.current?.(seed);
      }

      void e;
    },
    [wakeSim, sim.flingScale, seeds],
  );

  return {
    svgRef,
    groupRefs,
    bodies,
    draggingId,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    wakeSim,
  };
}
