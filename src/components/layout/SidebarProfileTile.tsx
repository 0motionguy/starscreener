"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SidebarProfileTileProps {
  /** Uppercase mono label rendered at the top of the tile (e.g. "WATCH"). */
  label: string;
  /** Destination route. */
  href: string;
  /** Optional count rendered prominently in the centre. Hidden when undefined. */
  count?: number;
  /** Optional icon used when no count is available (link-only tiles). */
  icon?: ReactNode;
  /** Override the auto-generated aria-label for the link. */
  ariaLabel?: string;
}

export function SidebarProfileTile({
  label,
  href,
  count,
  icon,
  ariaLabel,
}: SidebarProfileTileProps) {
  const hasCount = typeof count === "number";
  const computedAriaLabel =
    ariaLabel ?? (hasCount ? `${label}: ${count}` : label);

  return (
    <Link
      href={href}
      aria-label={computedAriaLabel}
      className={cn(
        "group flex flex-col items-start justify-between gap-1",
        "rounded-sm border px-2 py-1.5 transition-colors",
        "hover:bg-bg-card-hover",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1",
      )}
      style={{
        borderColor: "var(--v4-line-100)",
      }}
    >
      <span
        className="font-mono text-[9px] uppercase tracking-[0.16em]"
        style={{ color: "var(--ink-400)" }}
      >
        {label}
      </span>
      <span
        className="text-[14px] font-semibold tabular-nums leading-none"
        style={{ color: hasCount ? "var(--ink-100)" : "var(--ink-300)" }}
      >
        {hasCount ? count : icon ?? "→"}
      </span>
    </Link>
  );
}
