"use client";

import { Flame } from "lucide-react";

interface MomentumBadgeProps {
  score: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

type HeatTier = "hot" | "warm" | "neutral" | "cool";

const HEAT_CONFIG: Record<
  HeatTier,
  { label: string; color: string; bg: string }
> = {
  hot: {
    label: "Hot",
    color: "text-momentum-hot",
    bg: "bg-momentum-hot/12",
  },
  warm: {
    label: "Warm",
    color: "text-momentum-warm",
    bg: "bg-momentum-warm/12",
  },
  neutral: {
    label: "Neutral",
    color: "text-momentum-neutral",
    bg: "bg-momentum-neutral/12",
  },
  cool: {
    label: "Cool",
    color: "text-momentum-cool",
    bg: "bg-momentum-cool/12",
  },
};

function getTier(score: number): HeatTier {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "neutral";
  return "cool";
}

/**
 * Momentum score badge with heat-tier color coding.
 * Shows flame icon + pulse glow for hot (80+) scores.
 */
export function MomentumBadge({
  score,
  size = "sm",
  showLabel = false,
  className = "",
}: MomentumBadgeProps) {
  const tier = getTier(score);
  const config = HEAT_CONFIG[tier];

  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";
  const iconSize = size === "sm" ? 11 : 13;
  const isHot = tier === "hot";

  return (
    <span
      className={`inline-flex flex-col items-center ${className}`}
    >
      <span
        className={`inline-flex items-center gap-1 font-mono font-bold rounded-badge ${config.color} ${config.bg} ${sizeClasses} ${isHot ? "animate-pulse-glow" : ""}`}
      >
        {isHot && (
          <Flame size={iconSize} strokeWidth={2.5} className="shrink-0" />
        )}
        {score}
      </span>
      {showLabel && (
        <span
          className={`mt-0.5 text-[10px] font-medium uppercase tracking-wider ${config.color}`}
        >
          {config.label}
        </span>
      )}
    </span>
  );
}
