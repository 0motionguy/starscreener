// PredictionSnapshot — compact "projected trajectory" card rendered
// immediately after WhyTrending, above RepoSignalSnapshot.
//
// Server component (no client hooks). Consumes the PredictionItem shape
// from @/lib/repo-predictions. Returns null when no forecast is on disk —
// the page must not render an empty shell.
//
// Layout:
//   - Header: "PROJECTED" label, horizon badge on the right ("+30D").
//   - Main row: arrow icon + headline delta ("+2,400 stars (+8%)"),
//     followed by a horizontal band showing p10..point..p90 as a
//     mini-bar with the baseline pinned on the left.
//   - Footer: model version + "via calibration" tag.
//
// No new colors are invented — the card reuses bg-bg-primary,
// border-border-primary, text tokens, and `up`/`down` for the delta
// tone. The band uses the same tokens so it stays on-brand in both
// light and dark.

import type { JSX } from "react";
import { ArrowUpRight, ArrowRight, ArrowDownRight } from "lucide-react";

import type { PredictionItem } from "@/lib/repo-predictions";
import { formatNumber } from "@/lib/utils";

interface PredictionSnapshotProps {
  prediction: PredictionItem | null;
  currentStars: number;
}

function formatSignedInt(delta: number): string {
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(Math.round(delta)))}`;
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "-";
  const abs = Math.abs(pct);
  const rendered = abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  return `${sign}${rendered}%`;
}

function horizonLabel(days: number): string {
  if (days % 7 === 0 && days < 14) return `+${days}D`;
  return `+${days}D`;
}

export function PredictionSnapshot({
  prediction,
  currentStars,
}: PredictionSnapshotProps): JSX.Element | null {
  if (!prediction) return null;

  // Always compute delta against the live `currentStars` from the derived
  // repo — that's the freshest number visible on the page. The baseline
  // captured inside the prediction is used to sanity-check but we prefer
  // the live value so the card stays consistent with the chart above.
  const delta = prediction.pointEstimate - currentStars;
  const deltaPct =
    currentStars > 0 ? (delta / currentStars) * 100 : 0;

  const tone: "up" | "down" | "flat" =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const ArrowIcon =
    tone === "up"
      ? ArrowUpRight
      : tone === "down"
        ? ArrowDownRight
        : ArrowRight;

  const toneClass =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : "text-text-secondary";

  // Band geometry: the p10..p90 range is a horizontal bar. Inside the
  // bar we draw a tick at the point estimate so the reader can see the
  // skew. We clamp to [0,1] so rare inversions (p10 > p90 from a bad
  // writer) don't break the markup.
  const span = Math.max(1, prediction.p90 - prediction.p10);
  const rawOffset = (prediction.pointEstimate - prediction.p10) / span;
  const tickOffset = Math.min(1, Math.max(0, rawOffset));

  return (
    <section
      aria-label="Projected star trajectory"
      className="rounded-card border border-border-primary bg-bg-primary p-3 sm:p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          Projected
        </span>
        <span className="inline-flex items-center rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
          {horizonLabel(prediction.horizonDays)}
        </span>
      </header>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <ArrowIcon
            className={`size-4 shrink-0 ${toneClass}`}
            aria-hidden
          />
          <div className="flex items-baseline gap-2 font-mono">
            <span className={`text-sm ${toneClass}`}>
              {formatSignedInt(delta)} stars
            </span>
            <span className="text-[11px] text-text-tertiary">
              ({formatSignedPct(deltaPct)})
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1" aria-hidden>
          <div className="relative h-1.5 w-full rounded-full border border-border-primary bg-bg-muted">
            <span
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-primary"
              style={{ left: `${(tickOffset * 100).toFixed(2)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-text-tertiary">
            <span>{formatNumber(prediction.p10)}</span>
            <span className="text-text-secondary">
              {formatNumber(prediction.pointEstimate)}
            </span>
            <span>{formatNumber(prediction.p90)}</span>
          </div>
        </div>
      </div>

      <footer className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        <span>model {prediction.modelVersion}</span>
        <span aria-hidden>·</span>
        <span>via calibration</span>
        <span aria-hidden>·</span>
        <span>{prediction.horizonDays}d horizon</span>
      </footer>
    </section>
  );
}

export default PredictionSnapshot;
