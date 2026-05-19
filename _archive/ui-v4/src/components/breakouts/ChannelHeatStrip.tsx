// V4 — ChannelHeatStrip
//
// 24-cell hourly heatmap used in sub-pages.html § /breakouts polish. Each
// breakout row gets a strip showing when the breakout actually happened
// over the last 24 hours. Cells are tinted by intensity:
//
//   h0 (cold) → bg-100
//   h1 (low)  → 20% acc
//   h2 (med)  → 50% acc
//   h3 (hot)  → 85% acc
//
// Pure presentation — caller passes the per-hour intensity buckets.
//
// Usage:
//   <ChannelHeatStrip
//     hours={[0, 1, 1, 0, 2, 1, 2, 2, 1, 2, 3, 3, 2, 3, 3, 3, 2, 2, 1, 1, 0, 1, 0, 0]}
//   />

import { cn } from "@/lib/utils";

export type HeatLevel = 0 | 1 | 2 | 3;

export interface ChannelHeatStripProps {
  /** 24 numbers, each 0-3. Caller bucketizes raw counts to levels. */
  hours: HeatLevel[];
  className?: string;
  /** Optional aria-label override for accessibility. */
  label?: string;
}

export function ChannelHeatStrip({
  hours,
  className,
  label,
}: ChannelHeatStripProps) {
  if (hours.length !== 24) {
    // Tolerant fallback — pad/truncate to 24 so a malformed series doesn't
    // break the row layout. Console warning is fine in dev.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `ChannelHeatStrip expects exactly 24 hours, got ${hours.length}`,
      );
    }
  }
  const buckets: HeatLevel[] = Array.from(
    { length: 24 },
    (_, i) => (hours[i] ?? 0) as HeatLevel,
  );
  const ariaLabel =
    label ?? `Hourly activity ${describeStrip(buckets)} over last 24h`;
  return (
    <div
      className={cn("v4-heat-strip", className)}
      role="img"
      aria-label={ariaLabel}
    >
      {buckets.map((b, i) => (
        <i
          key={i}
          className={cn(
            "v4-heat-strip__cell",
            b > 0 && `v4-heat-strip__cell--h${b}`,
          )}
          title={`${String(i).padStart(2, "0")}:00 — level ${b}`}
        />
      ))}
    </div>
  );
}

function describeStrip(b: HeatLevel[]): string {
  const total = b.reduce<number>((s, v) => s + v, 0);
  const hot = b.filter((v) => v >= 2).length;
  return `total intensity ${total}, ${hot} hot hours`;
}
