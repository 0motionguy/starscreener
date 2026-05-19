// 4–6 metric tiles, responsive grid. The page passes already-computed
// SignalMetricCardProps; this component just lays them out. Empty array
// → renders nothing (caller decides whether the strip is useful).

import { SignalMetricCard, type SignalMetricCardProps } from "./SignalMetricCard";

interface SignalMetricStripProps {
  /** Max 6 per the spec. Caller is trusted to keep it sane. */
  metrics: SignalMetricCardProps[];
  className?: string;
}

export function SignalMetricStrip({ metrics, className = "" }: SignalMetricStripProps) {
  if (metrics.length === 0) return null;

  // Pick a column count so the grid feels balanced regardless of how
  // many tiles the page passes in (we let the grid choose 2/3/6).
  const lgCols = Math.min(6, Math.max(metrics.length, 4));

  return (
    <section
      className={
        "mb-6 grid grid-cols-2 gap-2.5 md:grid-cols-3 " +
        (lgCols === 6
          ? "lg:grid-cols-6"
          : lgCols === 5
            ? "lg:grid-cols-5"
            : "lg:grid-cols-4") +
        " " +
        className
      }
    >
      {metrics.map((m) => (
        <SignalMetricCard key={m.label} {...m} />
      ))}
    </section>
  );
}

export default SignalMetricStrip;
