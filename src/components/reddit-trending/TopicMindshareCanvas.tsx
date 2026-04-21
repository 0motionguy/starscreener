"use client";

// Client physics renderer for the topic mindshare map. Forked from
// BubbleMapCanvas but text-centered: cells show a topic phrase (up to 3
// words) and an upvote count, no avatars. Click a cell → add ?topic=X to
// URL so the feed below filters to posts containing that phrase.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import type { BaselineTier } from "@/lib/reddit-baselines";

export type TopicWindowKey = "24h" | "7d";

export interface TopicSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  phrase: string;
  upvotes: number;
  postCount: number;
  tier: BaselineTier;
  dominantSub: string;
  postIds: string[];
  fill: string;
  stroke: string;
  glow: string;
  textColor: string;
}

export type TopicWindowSeedSet = Record<TopicWindowKey, TopicSeed[]>;

interface Body extends TopicSeed {
  vx: number;
  vy: number;
  held: boolean;
}

interface TopicMindshareCanvasProps {
  windows: TopicWindowSeedSet;
  width: number;
  height: number;
}

const WINDOW_TABS: Array<{ key: TopicWindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
];

const SIM = {
  centerPull: 0.00045,
  damping: 0.9,
  pairPad: 1.5,
  wallBounce: -0.35,
  flingScale: 0.5,
  idleThreshold: 0.05,
  settleFrames: 30,
};

const CLICK_DRAG_THRESHOLD = 5;

const TIER_LEGEND: Array<{ tier: BaselineTier; label: string; color: string }> = [
  { tier: "breakout", label: "Breakout", color: "#f97316" },
  { tier: "above-average", label: "Above avg", color: "#22c55e" },
  { tier: "normal", label: "Normal", color: "#6b7280" },
  { tier: "no-baseline", label: "No baseline", color: "#94a3b8" },
];

export function TopicMindshareCanvas({
  windows,
  width,
  height,
}: TopicMindshareCanvasProps) {
  const defaultTab: TopicWindowKey =
    windows["24h"].length > 0 ? "24h" : "7d";
  const [activeTab, setActiveTab] = useState<TopicWindowKey>(defaultTab);

  const seeds = windows[activeTab];

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTopic = searchParams.get("topic");

  // Legend counts — by tier, not by sub (too many subs for a color key).
  const legendCounts = useMemo(() => {
    const counts = new Map<BaselineTier, number>();
    for (const s of seeds) {
      counts.set(s.tier, (counts.get(s.tier) ?? 0) + 1);
    }
    return TIER_LEGEND.map((entry) => ({
      ...entry,
      count: counts.get(entry.tier) ?? 0,
    })).filter((e) => e.count > 0);
  }, [seeds]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRefs = useRef<Record<string, SVGGElement | null>>({});
  const bodies = useRef<Body[]>(
    seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false })),
  );

  useEffect(() => {
    bodies.current = seeds.map((s) => ({ ...s, vx: 0, vy: 0, held: false }));
  }, [seeds]);

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
        if (speed > SIM.idleThreshold || a.held) {
          node.setAttribute("transform", `translate(${a.cx} ${a.cy})`);
        }
      }

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
      const dx = coords.x - p.lastX;
      const dy = coords.y - p.lastY;
      p.vx = dx;
      p.vy = dy;
      p.lastX = coords.x;
      p.lastY = coords.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      body.cx = coords.x + p.offsetX;
      body.cy = coords.y + p.offsetY;
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
        // Click → toggle topic filter. Clicking the active topic clears it.
        const params = new URLSearchParams(searchParams.toString());
        if (activeTopic === body.phrase) {
          params.delete("topic");
        } else {
          params.set("topic", body.phrase);
        }
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }

      void e;
    },
    [wakeSim, activeTopic, searchParams, router, pathname],
  );

  const bubbleElements = useMemo(() => {
    return seeds.map((s) => {
      const upvoteLabel = `▲ ${formatNumber(s.upvotes)}`;
      const showPhrase = s.r >= 26;
      const phraseFontSize = Math.max(9, Math.min(14, s.r * 0.18));
      const upvoteFontSize = Math.max(10, Math.min(18, s.r * 0.22));
      const maxPhraseChars = Math.max(8, Math.min(22, Math.round(s.r / 3.2)));
      const shortPhrase =
        s.phrase.length > maxPhraseChars
          ? `${s.phrase.slice(0, maxPhraseChars - 1)}…`
          : s.phrase;
      const isDragging = draggingId === s.id;
      const isActive = activeTopic === s.phrase;

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
            cursor: isDragging ? "grabbing" : "pointer",
            touchAction: "none",
          }}
          aria-label={`Topic "${s.phrase}" — ${s.upvotes} upvotes across ${s.postCount} posts (click to filter feed)`}
        >
          <circle r={Math.max(s.r, 22)} fill="transparent" />
          <circle
            r={s.r + (isDragging || isActive ? 10 : 4)}
            fill={s.glow}
            style={{ transition: "r 180ms ease-out" }}
          />
          <circle
            r={s.r}
            fill={`url(#tgrad-${s.id})`}
            stroke={isActive ? "#f6f9fc" : s.stroke}
            strokeWidth={isActive ? 2.5 : isDragging ? 2.25 : 1.5}
            style={{
              transition: "stroke-width 120ms ease-out",
              filter: isDragging
                ? "drop-shadow(0 6px 18px rgba(34,197,94,0.35))"
                : undefined,
            }}
          />
          {showPhrase && (
            <text
              x={0}
              y={-s.r * 0.12}
              textAnchor="middle"
              fill={s.textColor}
              fontSize={phraseFontSize}
              fontWeight={600}
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "-0.01em",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {shortPhrase}
            </text>
          )}
          <text
            x={0}
            y={showPhrase ? s.r * 0.32 : s.r * 0.1}
            textAnchor="middle"
            fill={s.textColor}
            fontSize={upvoteFontSize}
            fontWeight={700}
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {upvoteLabel}
          </text>
        </g>
      );
    });
  }, [seeds, draggingId, activeTopic, handlePointerDown]);

  return (
    <section
      aria-label="Topic mindshare map — drag to rearrange, click to filter feed"
      className="relative mb-4 rounded-card border border-border-primary bg-bg-card/60 overflow-hidden"
    >
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
              aria-label={`Show ${tab.label} window (${count} topics)`}
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
      {legendCounts.length > 0 && (
        <div
          aria-label="Tier legend"
          className="pt-11 px-3 pb-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
        >
          {legendCounts.map((entry) => (
            <span
              key={entry.tier}
              className="inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-text-secondary">{entry.label}</span>
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
        aria-label={`${seeds.length} trending topics by upvote mindshare`}
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
              key={`tg-${s.id}`}
              id={`tgrad-${s.id}`}
              cx="35%"
              cy="30%"
              r="75%"
            >
              <stop offset="0%" stopColor={s.fill} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.fill} stopOpacity={0.12} />
            </radialGradient>
          ))}
        </defs>
        {bubbleElements}
      </svg>
    </section>
  );
}
