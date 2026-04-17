"use client";

import { Crown, ChevronUp, ChevronDown } from "lucide-react";

interface RankBadgeProps {
  rank: number;
  previousRank?: number;
  size?: "sm" | "md";
  className?: string;
}

function getRankStyle(rank: number): { color: string; style?: React.CSSProperties } {
  switch (rank) {
    case 1:
      return { color: "text-accent-amber" };
    case 2:
      return { color: "", style: { color: "#C0C0C0" } };
    case 3:
      return { color: "", style: { color: "#CD7F32" } };
    default:
      return { color: "text-text-secondary" };
  }
}

/**
 * Rank display badge with positional flair.
 * Gold crown for #1, silver for #2, bronze for #3.
 * Shows rank change arrow when previousRank is provided.
 */
export function RankBadge({
  rank,
  previousRank,
  size = "sm",
  className = "",
}: RankBadgeProps) {
  const rankStyle = getRankStyle(rank);

  const sizeClasses = size === "sm" ? "text-xs" : "text-sm";
  const iconSize = size === "sm" ? 11 : 13;
  const deltaIconSize = size === "sm" ? 10 : 12;

  const delta =
    previousRank !== undefined && previousRank !== rank
      ? previousRank - rank
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-bold ${sizeClasses} ${rankStyle.color} ${className}`}
      style={rankStyle.style}
    >
      {rank === 1 && (
        <Crown
          size={iconSize}
          strokeWidth={2.5}
          className="shrink-0 text-accent-amber"
        />
      )}
      <span>#{rank}</span>
      {delta !== null && (
        <span
          className={`inline-flex items-center text-[10px] font-semibold ${
            delta > 0 ? "text-accent-green" : "text-accent-red"
          }`}
        >
          {delta > 0 ? (
            <>
              <ChevronUp size={deltaIconSize} strokeWidth={2.5} className="shrink-0" />
              {delta}
            </>
          ) : (
            <>
              <ChevronDown size={deltaIconSize} strokeWidth={2.5} className="shrink-0" />
              {Math.abs(delta)}
            </>
          )}
        </span>
      )}
    </span>
  );
}
