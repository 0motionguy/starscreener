import type { JSX, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatIconProps {
  icon?: LucideIcon;
  iconNode?: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "brand" | "up" | "down" | "warn";
}

const TONE_CLASS: Record<NonNullable<StatIconProps["tone"]>, string> = {
  default: "text-text-primary",
  brand: "text-brand",
  up: "text-[var(--v4-money)]",
  down: "text-[var(--v4-red)]",
  warn: "text-[var(--v4-amber)]",
};

/**
 * Compact stat tile: 14px icon on the left, label + value stacked on the right.
 */
export function StatIcon({
  icon: Icon,
  iconNode,
  label,
  value,
  hint,
  tone = "default",
}: StatIconProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 min-w-0"
      title={hint ?? `${label}: ${value}`}
    >
      {iconNode ?? (
        Icon ? (
          <Icon
            className="size-3.5 shrink-0 text-text-tertiary"
            aria-hidden="true"
          />
        ) : null
      )}
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="label-micro truncate">{label}</span>
        <span
          className={cn(
            "font-mono tabular-nums font-semibold text-[12px] truncate",
            TONE_CLASS[tone],
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
