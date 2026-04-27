"use client";

// Rich hover tooltip for the Subreddit Mindshare Map bubbles.
//
// Rendered as a fixed-position card pinned to the cursor. Position is computed
// in viewport coordinates by the canvas (clientX/clientY clamped to the
// window edge), so this component stays presentational — no DOM math here.
//
// Animations: framer-motion AnimatePresence handles the fade/lift.
// Performance: data is null during idle so the AnimatePresence subtree
// unmounts and we don't pay for a hidden DOM node 40 bubbles wide.

import { motion, AnimatePresence } from "framer-motion";
import { Sparkline } from "@/components/shared/Sparkline";
import { formatNumber } from "@/lib/utils";

export interface BubbleTooltipData {
  subreddit: string;
  activityScore: number;
  /** ratio of 24h activity vs 7d daily average; 1 = stable, >1 = heating */
  momentumRatio: number;
  breakoutCount: number;
  aboveAvgCount: number;
  totalPosts: number;
  /** up to 3 post titles, already trimmed to ~60 chars by the caller */
  topPostTitles: string[];
  /** 7 daily-binned activity totals, oldest → newest */
  sparkline7d: number[];
}

interface BubbleTooltipProps {
  visible: boolean;
  /** viewport-clamped page x (CSS px) */
  x: number;
  /** viewport-clamped page y (CSS px) */
  y: number;
  data: BubbleTooltipData | null;
}

type Tier = {
  label: string;
  badgeBg: string;
  badgeFg: string;
  arrow: "↑" | "↓" | "→";
};

function tierFor(ratio: number, breakoutCount: number): Tier {
  if (breakoutCount >= 3 || ratio > 5) {
    return {
      label: "BREAKOUT",
      badgeBg: "rgba(255, 102, 0, 0.18)",
      badgeFg: "#ff6600",
      arrow: "↑",
    };
  }
  if (ratio > 1.3) {
    return {
      label: "HEATING",
      badgeBg: "rgba(16, 185, 129, 0.18)",
      badgeFg: "#10B981",
      arrow: "↑",
    };
  }
  if (ratio >= 0.7) {
    return {
      label: "STABLE",
      badgeBg: "rgba(45, 90, 61, 0.25)",
      badgeFg: "#22c55e",
      arrow: "→",
    };
  }
  return {
    label: "COOLING",
    badgeBg: "rgba(107, 123, 141, 0.20)",
    badgeFg: "#94a3b8",
    arrow: "↓",
  };
}

export function BubbleTooltip({ visible, x, y, data }: BubbleTooltipProps) {
  return (
    <AnimatePresence>
      {visible && data && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 pointer-events-none w-[280px] v2-card shadow-lg p-3 font-mono text-xs"
          style={{ left: x, top: y }}
        >
          <TooltipBody data={data} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TooltipBody({ data }: { data: BubbleTooltipData }) {
  const tier = tierFor(data.momentumRatio, data.breakoutCount);
  const ratioText =
    data.momentumRatio >= 100
      ? `${Math.round(data.momentumRatio)}x`
      : `${data.momentumRatio.toFixed(1)}x`;

  return (
    <>
      {/* Header: r/SubName + tier badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-semibold text-text-primary truncate">
          r/{data.subreddit}
        </div>
        <div
          className="shrink-0 px-1.5 py-[2px] rounded text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: tier.badgeBg, color: tier.badgeFg }}
        >
          {tier.label}
        </div>
      </div>

      {/* Score line */}
      <div className="text-text-secondary mb-1.5 tabular-nums">
        Activity {formatNumber(Math.round(data.activityScore))}
        {" · "}
        <span style={{ color: tier.badgeFg }}>
          {tier.arrow} {ratioText} vs 7d avg
        </span>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-3 text-text-tertiary mb-2 tabular-nums">
        <span>
          <span className="text-[#ff6600]">▲</span> {data.breakoutCount}{" "}
          breakout
        </span>
        <span>
          <span className="text-[#22c55e]">●</span> {data.aboveAvgCount}{" "}
          above-avg
        </span>
        <span>{data.totalPosts} posts</span>
      </div>

      {/* Sparkline */}
      <div className="mb-2 -mx-1">
        <Sparkline
          data={data.sparkline7d}
          width={240}
          height={24}
          positive={data.momentumRatio >= 1}
        />
      </div>

      {/* Top 3 post titles */}
      {data.topPostTitles.length > 0 && (
        <div className="space-y-0.5 mb-2">
          {data.topPostTitles.map((title, i) => (
            <div
              key={i}
              className="text-text-secondary truncate"
              title={title}
            >
              <span className="text-text-muted">·</span> {title}
            </div>
          ))}
        </div>
      )}

      {/* Footer hint */}
      <div className="text-text-muted text-[10px] uppercase tracking-wider pt-1.5 border-t border-border-primary/60">
        {"// click bubble to filter feed"}
      </div>
    </>
  );
}
