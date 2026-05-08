"use client";

// KpiTile — single stat tile for KPI bands.
//
// Visual hierarchy:
//   - small caps label (with optional pip dot)
//   - bold large value (font-display)
//   - optional muted sub-label
//   - optional trend arrow + delta number
//
// Replaces inline stat-row implementations across pages while preserving
// the existing <KpiBand> wrapper. Adopted alongside KpiBand, not as a
// drop-in replacement — the orchestrator wires consumers.
//
// CSS tokens reused (no additions):
//   --sig-green / --sig-red / --sig-yellow|--sig-amber  (signal palette)
//   --v4-acc / --v4-money / --v4-src-x / --v4-blue       (theme accents)
//   --color-bg-secondary / --color-border-primary        (surface)
//   --color-text-primary / -secondary / -tertiary        (typography)
//   --radius-card                                        (corner)

import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type KpiTileTone =
  | "default"
  | "acc"
  | "money"
  | "x"
  | "blue"
  | "fresh"
  | "stale"
  | "dead";

export interface KpiTrendIndicator {
  /** -100 → +100 (percentage) or any signed absolute count. */
  delta: number;
  direction: "up" | "down" | "flat";
  /** e.g. "vs last 24h". Optional companion caption. */
  label?: string;
}

export interface KpiTileProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  trend?: KpiTrendIndicator;
  tone?: KpiTileTone;
  /** Explicit CSS color for the pip. Overrides tone-derived color. */
  pip?: string;
  className?: string;
}

const TONE_PIP_COLOR: Record<KpiTileTone, string> = {
  default: "var(--color-text-tertiary)",
  acc: "var(--v4-acc)",
  money: "var(--v4-money)",
  x: "var(--v4-src-x)",
  blue: "var(--v4-blue)",
  fresh: "var(--sig-green)",
  stale: "var(--sig-yellow,var(--sig-amber))",
  dead: "var(--sig-red)",
};

function formatDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "—";
  if (delta === 0) return "0";
  const abs = Math.abs(delta);
  const formatted =
    abs >= 1000 ? abs.toLocaleString("en-US") : abs.toFixed(abs < 10 ? 1 : 0);
  return delta > 0 ? `+${formatted}` : `−${formatted}`;
}

export function KpiTile({
  label,
  value,
  sub,
  trend,
  tone = "default",
  pip,
  className,
}: KpiTileProps): ReactNode {
  const pipColor = pip ?? TONE_PIP_COLOR[tone];
  const showPip = pip !== undefined || tone !== "default";

  const trendColor =
    trend === undefined
      ? null
      : trend.direction === "up"
        ? "text-[var(--sig-green)]"
        : trend.direction === "down"
          ? "text-[var(--sig-red)]"
          : "text-text-tertiary";

  const TrendIcon =
    trend === undefined
      ? null
      : trend.direction === "up"
        ? ArrowUp
        : trend.direction === "down"
          ? ArrowDown
          : ArrowRight;

  return (
    <div
      className={cn(
        "flex min-w-[110px] flex-col gap-0.5 rounded-card border border-border-primary bg-bg-secondary px-3 py-2",
        className,
      )}
      role="group"
      aria-label={typeof label === "string" ? label : undefined}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
        {showPip ? (
          <span
            className="size-1.5 rounded-full"
            style={{ background: pipColor }}
            aria-hidden="true"
          />
        ) : null}
        <span>{label}</span>
      </div>

      <div className="font-display text-2xl font-bold leading-tight text-text-primary md:text-3xl">
        {value}
      </div>

      {sub !== undefined && sub !== null ? (
        <div className="text-[11px] text-text-secondary">{sub}</div>
      ) : null}

      {trend !== undefined && TrendIcon !== null ? (
        <div
          className={cn(
            "flex items-center gap-1 font-mono text-[10px]",
            trendColor,
          )}
        >
          <TrendIcon className="size-3" aria-hidden="true" />
          <span>{formatDelta(trend.delta)}</span>
          {trend.label !== undefined ? (
            <span className="text-text-tertiary">· {trend.label}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
