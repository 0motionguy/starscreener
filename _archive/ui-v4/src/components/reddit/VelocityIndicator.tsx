// Per-post chevron indicator encoding the trending_score magnitude.
// Thresholds picked to visually separate the top ~20% of posts in a
// typical scrape. Will be tuned with real data.

import { cn } from "@/lib/utils";

export interface VelocityIndicatorProps {
  trendingScore?: number;
  /** When false, render nothing regardless of score. Lets callers hide
   * the indicator for posts below a per-page percentile (e.g. p90) so
   * the chevrons stay rare and meaningful. Defaults to true. */
  gated?: boolean;
}

export function VelocityIndicator({
  trendingScore,
  gated = true,
}: VelocityIndicatorProps) {
  if (!gated) return null;

  const s = trendingScore ?? 0;
  let chevrons = 0;
  if (s > 100) chevrons = 3;
  else if (s > 30) chevrons = 2;
  else if (s > 10) chevrons = 1;

  if (chevrons === 0) return null;

  const color =
    chevrons === 3
      ? "text-brand"
      : chevrons === 2
        ? "text-accent-green"
        : "text-text-secondary";

  return (
    <span
      className={cn("font-mono text-[11px] tracking-tight", color)}
      title={`trending_score=${s}`}
    >
      {"↑".repeat(chevrons)}
    </span>
  );
}
