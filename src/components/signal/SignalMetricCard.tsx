// Single metric tile in the Signal Terminal. Replaces the old internal
// "LAST SCRAPE / POSTS SCANNED / REPOS LINKED" tiles with a card shape
// that carries: label · value · 24h delta · sparkline · helper text.
//
// Per the spec: cards are useful, not internal. Don't ship a card with
// stale-only data — collapse it server-side instead.

import { Sparkline } from "./Sparkline";

export interface SignalMetricCardProps {
  label: string;
  value: string | number;
  /** Pre-formatted delta string e.g. "+12% 24h" or "+38 today". */
  delta?: string | null;
  /** Drives the delta color: pos = green, neg = red, neutral = muted. */
  deltaTone?: "pos" | "neg" | "neutral";
  /** 8-point series (hourly buckets) drawn under the value. */
  spark?: number[];
  /** Tone for the sparkline + accent. Defaults to "brand". */
  sparkTone?: "brand" | "up" | "down" | "warning" | "info";
  /** Helper line below the sparkline. Single-line, ellipsized. */
  helper?: string | null;
}

const SPARK_STROKE: Record<NonNullable<SignalMetricCardProps["sparkTone"]>, string> = {
  brand: "stroke-brand text-brand",
  up: "stroke-up text-up",
  down: "stroke-down text-down",
  warning: "stroke-warning text-warning",
  info: "stroke-functional text-functional",
};

export function SignalMetricCard({
  label,
  value,
  delta = null,
  deltaTone = "neutral",
  spark,
  sparkTone = "brand",
  helper = null,
}: SignalMetricCardProps) {
  const deltaColor =
    deltaTone === "pos"
      ? "text-up"
      : deltaTone === "neg"
        ? "text-down"
        : "text-text-tertiary";

  return (
    <div className="rounded-card border border-border-primary bg-bg-card px-3 py-2.5 transition hover:border-brand/30">
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-text-primary truncate">
          {value}
        </span>
        {delta ? (
          <span className={`font-mono text-[10px] tabular-nums ${deltaColor}`}>
            {delta}
          </span>
        ) : null}
      </div>
      {spark && spark.length >= 2 ? (
        <div className={`mt-1 ${SPARK_STROKE[sparkTone]}`}>
          <Sparkline data={spark} strokeClass={SPARK_STROKE[sparkTone]} />
        </div>
      ) : null}
      {helper ? (
        <div className="mt-1 text-[10px] font-mono text-text-tertiary truncate" title={helper}>
          {helper}
        </div>
      ) : null}
    </div>
  );
}

export default SignalMetricCard;
