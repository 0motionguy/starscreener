"use client";

import type { CSSProperties } from "react";

interface RankBadgeProps {
  rank: number;
  previousRank?: number;
  size?: "sm" | "md";
  className?: string;
}

function getRankStyle(rank: number): CSSProperties | undefined {
  switch (rank) {
    case 1:
      return { color: "var(--gold)" };
    case 2:
      return { color: "#c0c5cc" };
    case 3:
      return { color: "#cd7f32" };
    default:
      return undefined;
  }
}

/**
 * Rank display using the mockup's square leaderboard treatment.
 */
export function RankBadge({
  rank,
  previousRank,
  size = "sm",
  className = "",
}: RankBadgeProps) {
  const delta =
    previousRank !== undefined && previousRank !== rank
      ? previousRank - rank
      : null;

  const sizeClasses = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      className={`rank inline-flex items-baseline gap-1 font-sans font-semibold ${sizeClasses} ${className}`}
      style={getRankStyle(rank)}
    >
      <span>#{rank}</span>
      {delta !== null ? (
        <span
          className={`font-mono text-[10px] font-semibold ${
            delta > 0 ? "text-[var(--sig-green)]" : "text-[var(--sig-red)]"
          }`}
        >
          {delta > 0 ? `+${delta}` : `-${Math.abs(delta)}`}
        </span>
      ) : null}
    </span>
  );
}
