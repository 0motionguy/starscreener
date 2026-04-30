"use client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface MomentumBadgeProps {
  score: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

type HeatTier = "hot" | "warm" | "neutral" | "cool";

const HEAT_CONFIG: Record<
  HeatTier,
  { label: string; tone: BadgeTone }
> = {
  hot: {
    label: "Hot",
    tone: "hot",
  },
  warm: {
    label: "Warm",
    tone: "warning",
  },
  neutral: {
    label: "Neutral",
    tone: "neutral",
  },
  cool: {
    label: "Cool",
    tone: "external",
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

  const isHot = tier === "hot";

  return (
    <span className={`inline-flex flex-col items-center ${className}`}>
      <Badge
        tone={config.tone}
        size={size === "sm" ? "xs" : "sm"}
        className={isHot ? "animate-pulse-glow" : ""}
      >
        {score}
      </Badge>
      {showLabel && (
        <span
          className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-300)]"
        >
          {config.label}
        </span>
      )}
    </span>
  );
}
