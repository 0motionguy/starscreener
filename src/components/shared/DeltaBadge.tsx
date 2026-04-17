"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

interface DeltaBadgeProps {
  value: number;
  size?: "sm" | "md";
  showBackground?: boolean;
  className?: string;
  /**
   * Optional window label (e.g. "24h", "7d", "30d"). When present, renders a
   * muted suffix so readers can tell a +5% / day from a +5% / week at a glance.
   */
  window?: "24h" | "7d" | "30d";
}

/**
 * Percentage change badge with color coding and directional arrow.
 * Green for positive, red for negative, gray for zero.
 */
export function DeltaBadge({
  value,
  size = "sm",
  showBackground = false,
  className = "",
  window,
}: DeltaBadgeProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero = value === 0;

  const formatted = `${isPositive ? "+" : ""}${value.toFixed(1)}%`;

  const textColor = isPositive
    ? "text-accent-green"
    : isNegative
      ? "text-accent-red"
      : "text-text-tertiary";

  const bgClass =
    showBackground && !isZero
      ? isPositive
        ? "bg-accent-green/10"
        : "bg-accent-red/10"
      : showBackground && isZero
        ? "bg-text-tertiary/10"
        : "";

  const sizeClasses = size === "sm" ? "text-xs" : "text-sm";
  const iconSize = size === "sm" ? 10 : 12;

  const pillPadding = showBackground ? "px-2 py-0.5 rounded-badge" : "";

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono font-bold ${textColor} ${sizeClasses} ${bgClass} ${pillPadding} ${className}`}
    >
      {isPositive && (
        <TrendingUp
          size={iconSize}
          strokeWidth={2.5}
          className="shrink-0"
        />
      )}
      {isNegative && (
        <TrendingDown
          size={iconSize}
          strokeWidth={2.5}
          className="shrink-0"
        />
      )}
      {formatted}
      {window && (
        <span className="ml-1 font-normal text-text-tertiary/75">
          · {window}
        </span>
      )}
    </span>
  );
}
