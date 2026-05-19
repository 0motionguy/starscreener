/**
 * FundingSourcePillRow — per-source pill row with proportional bars
 * for the funding radar's "Source mix" card. Operator mockup (2026-05-16):
 * each source renders as a small pill on the left + a horizontal share
 * bar + the raw count on the right, replacing the original three-column
 * tabular layout for denser visual weight.
 */

import { cn } from "@/lib/utils";

export interface FundingSourceRow {
  source: string;
  count: number;
  /** Optional pre-resolved label. Falls back to `source` when absent. */
  label?: string;
}

interface FundingSourcePillRowProps {
  rows: FundingSourceRow[];
  /** Total signals (denominator for the share %). */
  total: number;
  /** Cap on the rendered row count. Default 8. */
  limit?: number;
  className?: string;
}

/** Cycle through 6 accent tones so adjacent rows are visually distinct. */
const PIP_TONE = (index: number): string => `sd-f${(index % 6) + 1}`;

export function FundingSourcePillRow({
  rows,
  total,
  limit = 8,
  className,
}: FundingSourcePillRowProps) {
  const visible = rows.slice(0, limit);
  const max = Math.max(1, ...visible.map((r) => r.count));

  return (
    <div className={cn("fnd-pill-rows", className)}>
      {visible.map((row, index) => {
        const share = total > 0 ? Math.round((row.count / total) * 100) : 0;
        const bar = Math.max(4, Math.round((row.count / max) * 100));
        const label = row.label ?? row.source;
        return (
          <div className="fnd-pill-row" key={row.source}>
            <span className={cn("fnd-pill", "col-pip", PIP_TONE(index))}>
              <span className="fnd-pill__dot" aria-hidden />
              <span className="fnd-pill__label">{label}</span>
            </span>
            <span
              className="fnd-pill__bar"
              role="progressbar"
              aria-valuenow={share}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${label} share: ${share}%`}
            >
              <i style={{ width: `${bar}%` }} />
            </span>
            <span className="fnd-pill__count tabular-nums">{row.count}</span>
            <span className="fnd-pill__share tabular-nums">{share}%</span>
          </div>
        );
      })}
    </div>
  );
}
