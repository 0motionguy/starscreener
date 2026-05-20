// TierHeatStrip - 4-cell breakout heat strip from 02-breakout.html.

export type BreakoutTier = "hot" | "warm" | "early" | "emerging";

export interface TierStat {
  tier: BreakoutTier;
  count: number;
  avgVelocityPct: number;
  deltaLabel?: string;
}

interface TierHeatStripProps {
  tiers: TierStat[];
}

interface TierMeta {
  label: string;
  cls: string;
  glyph: string;
  sourcesHint: string;
  chipClass: string;
  emptyLabel: string;
}

const META: Record<BreakoutTier, TierMeta> = {
  hot: {
    label: "HOT - >=15% velocity",
    cls: "hot",
    glyph: "UP",
    sourcesHint: "mentioned on 5+ sources",
    chipClass: "accent",
    emptyLabel: "quiet",
  },
  warm: {
    label: "WARM - 8-15% velocity",
    cls: "warm",
    glyph: "MID",
    sourcesHint: "mentioned on 3-4 sources",
    chipClass: "warn",
    emptyLabel: "quiet",
  },
  early: {
    label: "EARLY - 4-8% velocity",
    cls: "neutral",
    glyph: "NEW",
    sourcesHint: "1-2 sources, watch",
    chipClass: "",
    emptyLabel: "flat",
  },
  emerging: {
    label: "EMERGING - arXiv only",
    cls: "cool",
    glyph: "LAB",
    sourcesHint: "pre-OSS attention",
    chipClass: "info",
    emptyLabel: "paper-cited",
  },
};

export function TierHeatStrip({ tiers }: TierHeatStripProps) {
  return (
    <div className="heat-strip">
      {tiers.map((tierStat) => {
        const meta = META[tierStat.tier];
        const showAvg = tierStat.tier !== "emerging" && tierStat.count > 0;
        return (
          <div key={tierStat.tier} className={`heat-tier ${meta.cls}`}>
            <div className="tier-head">
              <span className="tier-label">
                {meta.glyph} {meta.label}
              </span>
              {tierStat.deltaLabel && (
                <span
                  className={`chip ${meta.chipClass}`}
                  style={{ fontSize: 9.5 }}
                >
                  {tierStat.deltaLabel}
                </span>
              )}
            </div>
            <div className="tier-count">{tierStat.count.toLocaleString()}</div>
            <div className="tier-velocity">
              {showAvg ? (
                <>
                  <b>Avg +{tierStat.avgVelocityPct.toFixed(0)}%</b> -{" "}
                  {meta.sourcesHint}
                </>
              ) : tierStat.tier === "emerging" ? (
                <>
                  <b>Paper-cited</b> - {meta.sourcesHint}
                </>
              ) : (
                <>
                  <b>{meta.emptyLabel}</b> - {meta.sourcesHint}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
