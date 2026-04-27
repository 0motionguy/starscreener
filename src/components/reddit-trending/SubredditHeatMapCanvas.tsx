"use client";

// Client renderer for the SUBREDDIT HEAT MAP.
//
// Renders a finviz-style treemap of subreddits using a squarified layout
// (src/lib/treemap.ts). Cell area = activity in the active window; cell
// color = momentum tier; hover = the existing BubbleTooltip rich card.
//
// State owned here:
//   • activeWindow      24H / 7D
//   • sortKey           ACTIVITY / MOMENTUM / BREAKOUTS
//   • hovered cell + cursor-pinned tooltip position
//
// Layout is recomputed via useMemo whenever data, sortKey, or container
// size change. Container size is observed with ResizeObserver so cells
// fit any width (the page renders 1200×400 at desktop, but we don't hard-
// code that here — width comes from the wrapper).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkline } from "@/components/shared/Sparkline";
import { formatNumber, cn } from "@/lib/utils";
import { squarifiedTreemap, type TreemapRect } from "@/lib/treemap";
import { BubbleTooltip, type BubbleTooltipData } from "./BubbleTooltip";

export type HeatWindowKey = "24h" | "7d";
export type HeatSortKey = "activity" | "momentum" | "breakouts";

export interface HeatCell {
  id: string;
  subreddit: string;
  activityScore: number;
  breakoutCount: number;
  aboveAvgCount: number;
  totalPosts: number;
  momentumRatio: number;
  tier: "breakout" | "heating" | "stable" | "cooling";
  fill: string;
  gradientEnd: string;
  textColor: string;
  topPostTitles: string[];
  sparkline7d: number[];
}

export type HeatWindowSet = Record<HeatWindowKey, HeatCell[]>;

interface SubredditHeatMapCanvasProps {
  windows: HeatWindowSet;
}

const WINDOW_TABS: Array<{ key: HeatWindowKey; label: string }> = [
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
];

const SORT_TABS: Array<{ key: HeatSortKey; label: string }> = [
  { key: "activity", label: "BY ACTIVITY" },
  { key: "momentum", label: "BY MOMENTUM" },
  { key: "breakouts", label: "BY BREAKOUTS" },
];

const ASPECT_RATIO = 12 / 4; // matches the bubble map footprint
const TOOLTIP_OFFSET = 14;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT_EST = 240;

// ---------------------------------------------------------------------------
// Sort weighting — what drives cell AREA in the treemap.
// "By activity" uses raw activity. "By momentum" weights by momentum ratio
// (so heating subs get bigger). "By breakouts" weights by breakoutCount + 1
// (so subs with no breakouts still appear, but breakout subs dominate).
// ---------------------------------------------------------------------------
function weightFor(cell: HeatCell, sortKey: HeatSortKey): number {
  switch (sortKey) {
    case "activity":
      return Math.max(1, cell.activityScore);
    case "momentum":
      // Activity × momentum, but log-compressed so 50× outliers don't crush
      // every other cell to 1px.
      return Math.max(
        1,
        cell.activityScore * Math.log1p(Math.max(0.1, cell.momentumRatio)),
      );
    case "breakouts":
      return Math.max(1, cell.activityScore * (cell.breakoutCount + 1));
  }
}

// ---------------------------------------------------------------------------
// Per-cell typography sizing — scales from the cell's smaller dimension.
// ---------------------------------------------------------------------------
interface CellTypography {
  showName: boolean;
  showValue: boolean;
  showFooter: boolean;
  showSparkline: boolean;
  showBreakoutBadge: boolean;
  nameSize: number;
  valueSize: number;
  footerSize: number;
  truncate: number;
  padding: number;
}

function typographyFor(w: number, h: number): CellTypography {
  const minDim = Math.min(w, h);
  if (w >= 200 && h >= 80) {
    return {
      showName: true,
      showValue: true,
      showFooter: true,
      showSparkline: true,
      showBreakoutBadge: true,
      nameSize: 16,
      valueSize: 28,
      footerSize: 11,
      truncate: 24,
      padding: 10,
    };
  }
  if (w >= 120 && h >= 60) {
    return {
      showName: true,
      showValue: true,
      showFooter: true,
      showSparkline: w >= 140,
      showBreakoutBadge: true,
      nameSize: 13,
      valueSize: 22,
      footerSize: 10,
      truncate: 18,
      padding: 8,
    };
  }
  if (w >= 80 && h >= 50) {
    return {
      showName: true,
      showValue: true,
      showFooter: h >= 70,
      showSparkline: false,
      showBreakoutBadge: w >= 90,
      nameSize: 11,
      valueSize: 17,
      footerSize: 9,
      truncate: 12,
      padding: 6,
    };
  }
  if (w >= 40 && h >= 30) {
    return {
      showName: true,
      showValue: minDim >= 38,
      showFooter: false,
      showSparkline: false,
      showBreakoutBadge: false,
      nameSize: 9,
      valueSize: 13,
      footerSize: 9,
      truncate: 8,
      padding: 4,
    };
  }
  return {
    showName: true,
    showValue: false,
    showFooter: false,
    showSparkline: false,
    showBreakoutBadge: false,
    nameSize: 8,
    valueSize: 10,
    footerSize: 8,
    truncate: 4,
    padding: 2,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return `${s.slice(0, max - 1)}…`;
}

function deltaColor(ratio: number): { color: string; arrow: "↑" | "↓" | "→" } {
  if (ratio > 1.3) return { color: "#86efac", arrow: "↑" };
  if (ratio >= 0.7) return { color: "rgba(255,255,255,0.65)", arrow: "→" };
  return { color: "#fca5a5", arrow: "↓" };
}

function deltaText(ratio: number): string {
  // Express ratio as a percent delta from 1.0.
  const pct = Math.round((ratio - 1) * 100);
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return "0%";
}

function tooltipDataFor(cell: HeatCell): BubbleTooltipData {
  return {
    subreddit: cell.subreddit,
    activityScore: cell.activityScore,
    momentumRatio: cell.momentumRatio,
    breakoutCount: cell.breakoutCount,
    aboveAvgCount: cell.aboveAvgCount,
    totalPosts: cell.totalPosts,
    topPostTitles: cell.topPostTitles,
    sparkline7d: cell.sparkline7d,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SubredditHeatMapCanvas({
  windows,
}: SubredditHeatMapCanvasProps) {
  const defaultWindow: HeatWindowKey =
    windows["24h"].length > 0 ? "24h" : "7d";
  const [activeWindow, setActiveWindow] = useState<HeatWindowKey>(defaultWindow);
  const [sortKey, setSortKey] = useState<HeatSortKey>("activity");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: BubbleTooltipData | null;
  }>({ visible: false, x: 0, y: 0, data: null });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSub = searchParams.get("sub");

  // ResizeObserver — track container width for the layout. Height stays
  // proportional via the ASPECT_RATIO constant.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 1200,
    h: 400,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.round(entry.contentRect.width));
        const h = Math.max(160, Math.round(w / ASPECT_RATIO));
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cells = windows[activeWindow];

  // Sort cells by chosen weight (used both for treemap area AND so the
  // rendered DOM order matches the visual prominence — better keyboard /
  // accessibility traversal).
  const sortedCells = useMemo(() => {
    return [...cells].sort(
      (a, b) => weightFor(b, sortKey) - weightFor(a, sortKey),
    );
  }, [cells, sortKey]);

  // Treemap layout — recomputed only when inputs change.
  const layout = useMemo(() => {
    const rects = squarifiedTreemap(
      sortedCells.map((c) => ({ id: c.id, value: weightFor(c, sortKey) })),
      { width: size.w, height: size.h, padding: 1 },
    );
    const byId = new Map<string, TreemapRect>();
    for (const r of rects) byId.set(r.id, r);
    return byId;
  }, [sortedCells, sortKey, size.w, size.h]);

  // ---------------------------------------------------------------------------
  // Hover handlers — pin tooltip to cursor, clamp to viewport edges.
  // ---------------------------------------------------------------------------
  const handleCellEnter = useCallback(
    (cell: HeatCell, e: React.PointerEvent<HTMLDivElement>) => {
      setHoveredId(cell.id);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rawX = e.clientX + TOOLTIP_OFFSET;
      const rawY = e.clientY + TOOLTIP_OFFSET;
      const x = Math.min(rawX, vw - TOOLTIP_WIDTH - 8);
      const y = Math.min(rawY, vh - TOOLTIP_HEIGHT_EST - 8);
      setTooltip({
        visible: true,
        x: Math.max(8, x),
        y: Math.max(8, y),
        data: tooltipDataFor(cell),
      });
    },
    [],
  );

  const handleCellMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setTooltip((prev) => {
      if (!prev.visible) return prev;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rawX = e.clientX + TOOLTIP_OFFSET;
      const rawY = e.clientY + TOOLTIP_OFFSET;
      const x = Math.min(rawX, vw - TOOLTIP_WIDTH - 8);
      const y = Math.min(rawY, vh - TOOLTIP_HEIGHT_EST - 8);
      return { ...prev, x: Math.max(8, x), y: Math.max(8, y) };
    });
  }, []);

  const handleCellLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleCellClick = useCallback(
    (cell: HeatCell) => {
      const params = new URLSearchParams(searchParams.toString());
      if (activeSub === cell.subreddit) {
        params.delete("sub");
      } else {
        params.set("sub", cell.subreddit);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, activeSub],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-2">
      {/* Top control strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {/* Window toggle */}
        <div className="inline-flex items-center gap-0 rounded-md border border-border-primary bg-bg-secondary p-0.5">
          {WINDOW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveWindow(tab.key)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors",
                activeWindow === tab.key
                  ? "bg-accent-green/20 text-accent-green"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <div className="inline-flex items-center gap-0 rounded-md border border-border-primary bg-bg-secondary p-0.5">
          {SORT_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSortKey(tab.key)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors",
                sortKey === tab.key
                  ? "bg-accent-green/20 text-accent-green"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap container */}
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded-md overflow-hidden border border-border-primary"
        style={{ aspectRatio: `${ASPECT_RATIO}` }}
      >
        {sortedCells.map((cell) => {
          const rect = layout.get(cell.id);
          if (!rect) return null;
          return (
            <Cell
              key={cell.id}
              cell={cell}
              rect={rect}
              hovered={hoveredId === cell.id}
              active={activeSub === cell.subreddit}
              onEnter={handleCellEnter}
              onMove={handleCellMove}
              onLeave={handleCellLeave}
              onClick={handleCellClick}
            />
          );
        })}

        {/* Inline keyframes for breakout pulse — local to this component
            so we don't need to add anything to globals.css. */}
        <style>{`
          @keyframes heatmap-breakout-pulse {
            0%, 100% { box-shadow: inset 0 0 12px rgba(0,0,0,0.25), 0 0 0 rgba(255, 69, 0, 0); }
            50%      { box-shadow: inset 0 0 12px rgba(0,0,0,0.25), 0 0 12px rgba(255, 69, 0, 0.55); }
          }
        `}</style>
      </div>

      {/* Legend strip */}
      <Legend />

      {/* Hover tooltip — REUSED from the bubble map, not rebuilt. */}
      <BubbleTooltip
        visible={tooltip.visible}
        x={tooltip.x}
        y={tooltip.y}
        data={tooltip.data}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single cell — motion.div with framer layout animation between sorts.
// ---------------------------------------------------------------------------
interface CellProps {
  cell: HeatCell;
  rect: TreemapRect;
  hovered: boolean;
  active: boolean;
  onEnter: (cell: HeatCell, e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onLeave: () => void;
  onClick: (cell: HeatCell) => void;
}

function Cell({
  cell,
  rect,
  hovered,
  active,
  onEnter,
  onMove,
  onLeave,
  onClick,
}: CellProps) {
  const reduceMotion = useReducedMotion();
  const typo = typographyFor(rect.w, rect.h);
  const delta = deltaColor(cell.momentumRatio);
  const isBreakout = cell.tier === "breakout";

  // The cell uses a CSS gradient (135deg, fill → gradientEnd) so the color
  // ramp reads at-a-glance like a finviz cell. Border is super-thin
  // (rgba 0.06) on normal cells, Reddit orange on breakouts.
  const background = `linear-gradient(135deg, ${cell.fill} 0%, ${cell.gradientEnd} 100%)`;
  const borderColor = isBreakout
    ? "#ff4500"
    : active
      ? "rgba(255, 255, 255, 0.45)"
      : "rgba(255, 255, 255, 0.06)";
  const baseShadow = "inset 0 0 12px rgba(0,0,0,0.25)";

  return (
    <motion.div
      // Explicit x/y/w/h drive the layout — we don't need framer's `layout`
      // prop because we know the target rect every render. Window/sort
      // toggles morph cells via this animate prop alone, no FLIP needed.
      initial={false}
      animate={{
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
      }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
      }
      whileHover={reduceMotion ? undefined : { scale: 1.02, zIndex: 10 }}
      style={{
        position: "absolute",
        background,
        color: cell.textColor,
        borderWidth: isBreakout ? 1.5 : 1,
        borderStyle: "solid",
        borderColor,
        boxShadow: hovered
          ? `${baseShadow}, 0 4px 16px rgba(0,0,0,0.5)`
          : baseShadow,
        filter: hovered ? "brightness(1.08)" : "brightness(1)",
        cursor: "pointer",
        overflow: "hidden",
        animation:
          isBreakout && !reduceMotion
            ? "heatmap-breakout-pulse 3s ease-in-out infinite"
            : undefined,
      }}
      onPointerEnter={(e) => onEnter(cell, e)}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={() => onClick(cell)}
    >
      <CellContent cell={cell} typo={typo} delta={delta} isBreakout={isBreakout} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Cell content — laid out absolutely so it survives parent resize without
// re-flow shimmer. Skipped pieces gracefully degrade for tiny cells.
// ---------------------------------------------------------------------------
interface CellContentProps {
  cell: HeatCell;
  typo: CellTypography;
  delta: { color: string; arrow: "↑" | "↓" | "→" };
  isBreakout: boolean;
}

function CellContent({ cell, typo, delta, isBreakout }: CellContentProps) {
  const name = truncate(cell.subreddit, typo.truncate);
  const value = formatNumber(Math.round(cell.activityScore));

  return (
    <div
      className="absolute inset-0 flex flex-col font-mono text-white select-none"
      style={{ padding: typo.padding }}
    >
      {/* Top row: name + breakout badge */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        {typo.showName && (
          <div
            className="font-bold leading-tight truncate"
            style={{
              fontSize: typo.nameSize,
              letterSpacing: "-0.01em",
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            }}
            title={`r/${cell.subreddit}`}
          >
            {name}
          </div>
        )}
        {typo.showBreakoutBadge && cell.breakoutCount > 0 && (
          <div
            className="shrink-0 rounded px-1 leading-none font-bold"
            style={{
              fontSize: Math.max(8, typo.footerSize - 1),
              backgroundColor: "rgba(255, 69, 0, 0.85)",
              color: "#ffffff",
              padding: "2px 4px",
            }}
          >
            ▲ {cell.breakoutCount}
          </div>
        )}
      </div>

      {/* Middle: big activity number, vertically centered in remaining space */}
      {typo.showValue && (
        <div
          className="flex-1 flex items-center justify-start min-h-0"
          style={{ marginTop: 2, marginBottom: 2 }}
        >
          <div
            className="font-extrabold leading-none truncate"
            style={{
              fontSize: typo.valueSize,
              letterSpacing: "-0.02em",
              textShadow: "0 1px 3px rgba(0,0,0,0.4)",
            }}
          >
            {value}
          </div>
        </div>
      )}

      {/* Bottom row: momentum delta (left) + sparkline (right) */}
      {typo.showFooter && (
        <div className="flex items-end justify-between gap-1 min-w-0">
          <div
            className="font-mono font-semibold tabular-nums leading-none"
            style={{
              fontSize: typo.footerSize,
              color: delta.color,
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            }}
          >
            {delta.arrow} {deltaText(cell.momentumRatio)}
          </div>
          {typo.showSparkline && (
            <div
              style={{ opacity: 0.7 }}
              aria-hidden="true"
            >
              <Sparkline
                data={cell.sparkline7d}
                width={40}
                height={12}
                positive={cell.momentumRatio >= 1}
              />
            </div>
          )}
        </div>
      )}

      {/* Decorative top-right tier dot when nothing else fits there */}
      {!typo.showBreakoutBadge && isBreakout && (
        <div
          className="absolute"
          style={{
            top: 3,
            right: 3,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "#ff4500",
            boxShadow: "0 0 6px rgba(255, 69, 0, 0.8)",
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend strip — gradient bar + tier labels.
// ---------------------------------------------------------------------------
function Legend() {
  return (
    <div className="flex items-center gap-3 px-1 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
      <span>COOLING</span>
      <div
        className="h-2 flex-1 rounded-sm border border-border-primary/60"
        style={{
          background:
            "linear-gradient(90deg, #4A5568 0%, #6B7B8D 22%, #2D5A3D 38%, #22c55e 58%, #10B981 72%, #ff6600 88%, #ff4500 100%)",
        }}
        aria-hidden="true"
      />
      <span>HEATING</span>
      <span style={{ color: "#ff6600" }}>BREAKOUT</span>
    </div>
  );
}

