// TierHeatStrip — 4-cell breakout-tier heat strip (hot/warm/early/emerging).
// Mirrors the .heat-strip grid from 02-breakout.html.
//
// Tier definitions (velocity = starsDelta24h / max(stars, 1)):
//   • hot       ≥ 15% velocity, ≥ 5 mention sources
//   • warm      8–15% velocity, ≥ 3 mention sources
//   • early     4–8% velocity, < 3 sources (watch)
//   • emerging  arXiv-linked only — pre-OSS attention
//
// Counts + avg-velocity copy are derived per tier in the page; this
// component is presentational.

export type BreakoutTier = "hot" | "warm" | "early" | "emerging";

export interface TierStat {
  tier: BreakoutTier;
  count: number;
  /** Mean velocity for repos in this tier, expressed as a percentage. */
  avgVelocityPct: number;
}

interface TierHeatStripProps {
  tiers: TierStat[];
}

interface TierMeta {
  label: string;
  cls: string;
  glyph: string;
  velocityHint: string;
  sourcesHint: string;
  emergingHint?: string;
}

const META: Record<BreakoutTier, TierMeta> = {
  hot: {
    label: "HOT · ≥15% velocity",
    cls: "hot",
    glyph: "▲",
    velocityHint: "Avg",
    sourcesHint: "mentioned on 5+ sources",
  },
  warm: {
    label: "WARM · 8–15% velocity",
    cls: "warm",
    glyph: "◆",
    velocityHint: "Avg",
    sourcesHint: "mentioned on 3-4 sources",
  },
  early: {
    label: "EARLY · 4–8% velocity",
    cls: "neutral",
    glyph: "●",
    velocityHint: "Avg",
    sourcesHint: "1-2 sources, watch",
  },
  emerging: {
    label: "EMERGING · arXiv only",
    cls: "cool",
    glyph: "○",
    velocityHint: "Paper-cited",
    sourcesHint: "pre-OSS attention",
    emergingHint: "Paper-cited",
  },
};

export function TierHeatStrip({ tiers }: TierHeatStripProps) {
  return (
    <div className="heat-strip">
      {tiers.map((t) => {
        const meta = META[t.tier];
        const showAvg = t.tier !== "emerging" && t.count > 0;
        return (
          <div key={t.tier} className={`heat-tier ${meta.cls}`}>
            <div className="tier-head">
              <span className="tier-label">
                {meta.glyph} {meta.label}
              </span>
            </div>
            <div className="tier-count">{t.count.toLocaleString()}</div>
            <div className="tier-velocity">
              {showAvg ? (
                <>
                  <b>Avg +{t.avgVelocityPct.toFixed(0)}%</b> · {meta.sourcesHint}
                </>
              ) : t.tier === "emerging" ? (
                <>
                  <b>{meta.emergingHint}</b> · {meta.sourcesHint}
                </>
              ) : (
                <>
                  <b>— quiet</b> · {meta.sourcesHint}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
