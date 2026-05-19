"use client";

import { Badge } from "@/components/ui/Badge";

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
 * Percentage change badge with the square mono delta treatment from the
 * mockups. Green for positive, red for negative, muted for zero.
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

  const formatted = `${isPositive ? "+" : ""}${value.toFixed(1)}%`;
  const tone = isPositive ? "positive" : isNegative ? "danger" : "neutral";
  const textColor = isPositive
    ? "text-[var(--sig-green)]"
    : isNegative
      ? "text-[var(--sig-red)]"
      : "text-[var(--ink-400)]";

  const sizeClasses = size === "sm" ? "text-xs" : "text-sm";
  const content = (
    <>
      {formatted}
      {window ? (
        <span className="ml-1 font-normal text-[var(--ink-400)]">
          / {window}
        </span>
      ) : null}
    </>
  );

  if (showBackground) {
    return (
      <Badge
        tone={tone}
        size={size === "sm" ? "xs" : "sm"}
        className={className}
      >
        {content}
      </Badge>
    );
  }

  return (
    <span
      className={`delta inline-flex items-center font-mono font-bold ${textColor} ${sizeClasses} ${className}`}
    >
      {content}
    </span>
  );
}
