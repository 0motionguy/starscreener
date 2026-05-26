// BreakoutConsensusStrip — 4 KPI tiles for source-consensus tiers.
//
// Real data only. Counts come from active source channels in repo.mentions
// + channelStatus + linkedArxivIds. Velocity = avg starsDelta24h / stars × 100
// for repos in each tier.
//
// Tiers:
//   high   — 5+ active mention sources (HIGH CONSENSUS)
//   mid    — 3-4 active sources (MID CONSENSUS)
//   low    — 1-2 active sources (LOW CONSENSUS)
//   paper  — arxiv-cited but no broad social coverage (PAPER CITED)

export type ConsensusTier = "high" | "mid" | "low" | "paper";

export interface ConsensusBucket {
  tier: ConsensusTier;
  count: number;
  avgVelocityPct: number;
}

interface BreakoutConsensusStripProps {
  buckets: ConsensusBucket[];
  total: number;
}

const TIER_META: Record<
  ConsensusTier,
  { label: string; descriptor: string; dotsActive: number }
> = {
  high: { label: "HIGH CONSENSUS", descriptor: "mentioned on 5+ sources", dotsActive: 5 },
  mid: { label: "MID CONSENSUS", descriptor: "3-4 sources agreeing", dotsActive: 4 },
  low: { label: "LOW CONSENSUS", descriptor: "1-2 sources, watch", dotsActive: 2 },
  paper: { label: "PAPER CITED", descriptor: "arXiv-only, pre-OSS", dotsActive: 1 },
};

const TIER_ORDER: ConsensusTier[] = ["high", "mid", "low", "paper"];

function formatPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  // Below 10%, keep one decimal so sub-percent leaders stay readable
  // ("+0.4%" not "+0%"). At/above 10%, integers — the magnitude is the story.
  const digits = pct < 10 ? 1 : 0;
  return `+${pct.toFixed(digits)}%`;
}

export function BreakoutConsensusStrip({ buckets, total }: BreakoutConsensusStripProps) {
  const byTier = new Map(buckets.map((bucket) => [bucket.tier, bucket]));

  return (
    <div className="bk-consensus-strip" role="list" aria-label="Consensus tiers">
      {TIER_ORDER.map((tier) => {
        const bucket = byTier.get(tier) ?? { tier, count: 0, avgVelocityPct: 0 };
        const meta = TIER_META[tier];
        return (
          <div
            key={tier}
            className={`bk-consensus-tile bk-consensus-tile--${tier}`}
            role="listitem"
          >
            <div className="bk-ct-head">
              <span className="bk-ct-label">{meta.label}</span>
            </div>
            <div className="bk-ct-body">
              <span className="bk-ct-pct">
                {tier === "paper" ? (
                  <>
                    {formatPct(bucket.avgVelocityPct)}
                    <span className="bk-ct-paper-mark" aria-hidden="true">●</span>
                    <span className="bk-ct-paper-tag">paper</span>
                  </>
                ) : (
                  <>
                    {formatPct(bucket.avgVelocityPct)}
                    <span className="bk-ct-dots" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={`bk-ct-dot${i < meta.dotsActive ? " on" : ""}`}
                        />
                      ))}
                    </span>
                  </>
                )}
              </span>
              <span className="bk-ct-count">
                <span className="bk-ct-count-num">{bucket.count}</span>
                <span className="bk-ct-count-sep">/</span>
                <span className="bk-ct-count-total">{total}</span>
              </span>
            </div>
            <div className="bk-ct-foot">{meta.descriptor}</div>
          </div>
        );
      })}
    </div>
  );
}
