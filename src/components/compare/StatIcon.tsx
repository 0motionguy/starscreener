import type { JSX } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatIconProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "brand" | "up" | "down" | "warn";
}

const TONE_CLASS: Record<NonNullable<StatIconProps["tone"]>, string> = {
  default: "text-text-primary",
  brand: "text-brand",
  up: "text-up",
  down: "text-down",
  warn: "text-warning",
};

/**
 * Compact stat tile: 14px icon on the left, label + value stacked on the right.
 */
export function StatIcon({
  icon: Icon,
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
      <Icon
        className="size-3.5 shrink-0 text-text-tertiary"
        aria-hidden="true"
      />
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
