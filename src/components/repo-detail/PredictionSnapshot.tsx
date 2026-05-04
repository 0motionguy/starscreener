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
// V4 chrome: surfaces use --v4-bg-* / --v4-ink-* / --v4-line-* tokens.
// The delta tone uses --v4-money (up) / --v4-red (down) / --v4-ink-300
// (flat) so the card stays on-brand in both light and dark.

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

  const toneColor =
    tone === "up"
      ? "var(--v4-money)"
      : tone === "down"
        ? "var(--v4-red)"
        : "var(--v4-ink-300)";

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
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 11,
            color: "var(--v4-ink-200)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// PROJECTED"}
        </span>
        <span
          className="shrink-0 tabular-nums"
          style={{
            padding: "1px 6px",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 2,
            fontSize: 10,
            color: "var(--v4-acc)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {horizonLabel(prediction.horizonDays)}
        </span>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            <ArrowIcon
              size={16}
              className="shrink-0"
              style={{ color: toneColor }}
              aria-hidden
            />
            <div
              className="flex items-baseline gap-2"
              style={{ fontFamily: "var(--font-geist-mono), monospace" }}
            >
              <span
                className="tabular-nums"
                style={{
                  fontSize: 14,
                  color: toneColor,
                  fontWeight: 510,
                }}
              >
                {formatSignedInt(delta)} stars
              </span>
              <span
                className="tabular-nums"
                style={{ fontSize: 11, color: "var(--v4-ink-400)" }}
              >
                ({formatSignedPct(deltaPct)})
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1" aria-hidden>
            <div
              className="relative h-1.5 w-full"
              style={{
                background: "var(--v4-bg-100)",
                border: "1px solid var(--v4-line-200)",
                borderRadius: 1,
              }}
            >
              <span
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${(tickOffset * 100).toFixed(2)}%`,
                  background: "var(--v4-acc)",
                  borderRadius: 1,
                }}
              />
            </div>
            <div
              className="mt-1 flex items-center justify-between tabular-nums"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                color: "var(--v4-ink-400)",
              }}
            >
              <span>{formatNumber(prediction.p10)}</span>
              <span style={{ color: "var(--v4-ink-200)" }}>
                {formatNumber(prediction.pointEstimate)}
              </span>
              <span>{formatNumber(prediction.p90)}</span>
            </div>
          </div>
        </div>

        <footer
          className="flex items-center gap-2"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            color: "var(--v4-ink-400)",
          }}
        >
          <span>{`// MODEL ${prediction.modelVersion}`}</span>
          <span aria-hidden style={{ color: "var(--v4-line-300)" }}>·</span>
          <span>VIA CALIBRATION</span>
          <span aria-hidden style={{ color: "var(--v4-line-300)" }}>·</span>
          <span>{prediction.horizonDays}D HORIZON</span>
        </footer>
      </div>
    </section>
  );
}

export default PredictionSnapshot;
