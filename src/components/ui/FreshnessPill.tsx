"use client";

// FreshnessPill — green/amber/red dot + relative time label.
//
// Used everywhere "last updated X" appears: source page headers,
// row-level staleness in StaleCollapse, KPI freshness indicators.
//
// Color tiers (default budget):
//   < 1h   → fresh / green  (var(--sig-green))
//   < 24h  → stale / amber  (var(--sig-yellow, var(--sig-amber)))
//   ≥ 24h  → dead  / red    (var(--sig-red))
//
// `iso` is the source-of-truth timestamp string (ISO-8601). null/undefined
// renders the "no data yet" affordance instead of crashing.
//
// Note: there's a local ageLabel helper in src/app/signals/page.tsx —
// don't share it. Defined fresh here. Future cleanup: extract to a shared util.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Budget {
  fresh: number; // ms below which it's GREEN; default 60 * 60 * 1000 (1h)
  stale: number; // ms below which it's AMBER; default 24 * 60 * 60 * 1000 (24h)
  // dead: anything above stale → RED
}

interface Props {
  iso: string | null | undefined;
  budget?: Budget;
  /** Hide the text label for compact contexts (dot only). Default true. */
  showLabel?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const DEFAULT_BUDGET: Budget = {
  fresh: 60 * 60 * 1000,
  stale: 24 * 60 * 60 * 1000,
};

function ageLabel(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const SIZE_TEXT = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-xs",
} as const;

export function FreshnessPill({
  iso,
  budget = DEFAULT_BUDGET,
  showLabel = true,
  size = "sm",
  className,
}: Props): ReactNode {
  if (iso === null || iso === undefined || iso === "") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 no-underline",
          className,
        )}
        aria-label="No data yet"
      >
        <span
          className="size-1.5 rounded-full bg-[var(--ink-500,var(--color-text-tertiary))]"
          aria-hidden="true"
        />
        {showLabel ? (
          <span
            className={cn(
              "font-mono text-text-tertiary",
              SIZE_TEXT[size],
            )}
          >
            no data yet
          </span>
        ) : null}
      </span>
    );
  }

  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 no-underline", className)}
        aria-label="Invalid timestamp"
      >
        <span
          className="size-1.5 rounded-full bg-[var(--ink-500,var(--color-text-tertiary))]"
          aria-hidden="true"
        />
        {showLabel ? (
          <span
            className={cn("font-mono text-text-tertiary", SIZE_TEXT[size])}
          >
            unknown
          </span>
        ) : null}
      </span>
    );
  }

  const ms = Date.now() - parsed;
  const tier: "fresh" | "stale" | "dead" =
    ms < budget.fresh ? "fresh" : ms < budget.stale ? "stale" : "dead";

  const dotClass =
    tier === "fresh"
      ? "bg-[var(--sig-green)]"
      : tier === "stale"
        ? "bg-[var(--sig-yellow,var(--sig-amber))]"
        : "bg-[var(--sig-red)]";

  const label =
    tier === "fresh"
      ? `Updated ${ageLabel(ms)}`
      : tier === "stale"
        ? `Stale ${ageLabel(ms)}`
        : `Dead ${ageLabel(ms)}`;

  return (
    <abbr
      title={`Last updated at ${iso}`}
      className={cn(
        "inline-flex items-center gap-1 no-underline",
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", dotClass)}
        aria-hidden="true"
      />
      {showLabel ? (
        <span
          className={cn(
            "font-mono text-text-tertiary",
            SIZE_TEXT[size],
          )}
        >
          {label}
        </span>
      ) : null}
    </abbr>
  );
}
