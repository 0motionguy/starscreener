// BubbleMap - velocity x consensus bubble chart, server-rendered.

import type { BreakoutTier } from "./TierHeatStrip";

export interface BubblePoint {
  fullName: string;
  short: string;
  velocityPct: number;
  sourceCount: number;
  mentionVolume: number;
  tier: BreakoutTier;
}

interface BubbleMapProps {
  bubbles: BubblePoint[];
  hotCount: number;
  warmCount: number;
  emergingCount: number;
  windowLabel: string;
}

const TIER_CLASS: Record<BreakoutTier, string> = {
  hot: "hot",
  warm: "warm",
  early: "neutral",
  emerging: "cool",
};

function velocityToXPercent(pct: number): number {
  const clamped = Math.max(0, Math.min(25, pct));
  return 9 + (clamped / 25) * 84;
}

function sourcesToYPercent(count: number): number {
  const clamped = Math.max(0, Math.min(7, count));
  return 82 - (clamped / 7) * 72;
}

function volumeToDiameter(volume: number): number {
  if (volume <= 0) return 28;
  const log = Math.log10(volume + 1);
  const scaled = Math.min(1, log / 3);
  return Math.round(28 + scaled * (84 - 28));
}

export function BubbleMap({
  bubbles,
  hotCount,
  warmCount,
  emergingCount,
  windowLabel,
}: BubbleMapProps) {
  return (
    <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="eyebrow">
          | Velocity x consensus map - {bubbles.length.toLocaleString()} breakouts
        </div>
        <div className="row gap-2">
          <span className="chip up">{hotCount} hot</span>
          <span className="chip warn">{warmCount} warm</span>
          <span className="chip info">{emergingCount} emerging</span>
        </div>
      </div>

      <div className="bubble-wrap" role="img" aria-label="Velocity by consensus bubble map">
        <div className="bubble-axis-y">
          MENTIONS UP
          <br />
          (sources active)
        </div>
        <div className="bubble-axis-x">VELOCITY - ({windowLabel} %)</div>

        <div className="axis-line x" />
        <div className="axis-line y" />

        {[
          ["+5%", 22],
          ["+10%", 39],
          ["+15%", 56],
          ["+20%", 73],
          ["+25%", 90],
        ].map(([label, left]) => (
          <div key={label} className="axis-label-x" style={{ left: `${left}%` }}>
            {label}
          </div>
        ))}
        {[
          ["6", 18],
          ["4", 38],
          ["2", 58],
          ["1", 76],
        ].map(([label, top]) => (
          <div key={label} className="axis-label-y" style={{ top: `${top}%` }}>
            {label}
          </div>
        ))}

        {bubbles.map((bubble) => {
          const parts = bubble.fullName.split("/");
          const owner = parts[0];
          const name = parts[1];
          if (!owner || !name) return null;
          const diameter = volumeToDiameter(bubble.mentionVolume);
          const cls = TIER_CLASS[bubble.tier];
          const title = `${bubble.fullName} - +${bubble.velocityPct.toFixed(1)}% velocity - ${bubble.sourceCount} sources - ${bubble.mentionVolume.toLocaleString()} mentions`;
          return (
            <a
              key={bubble.fullName}
              className={`bubble ${cls}`}
              style={{
                left: `${velocityToXPercent(bubble.velocityPct)}%`,
                top: `${sourcesToYPercent(bubble.sourceCount)}%`,
                width: diameter,
                height: diameter,
              }}
              href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
              title={title}
            >
              <span className="bubble-name">{bubble.short}</span>
              {bubble.velocityPct >= 1 && (
                <span className="bubble-delta">
                  +{Math.round(bubble.velocityPct)}%
                </span>
              )}
            </a>
          );
        })}

        <div className="bubble-legend">
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--accent)" }} />{" "}
            {"Hot - >=15% velocity"}
          </div>
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--warning)" }} /> Warm - 8-15%
          </div>
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--fg-subtle)" }} /> Early - 4-8%
          </div>
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--info)" }} /> Emerging -
            arXiv-only
          </div>
          <div className="muted" style={{ fontSize: 9.5, marginTop: 4 }}>
            bubble size = mention volume
          </div>
        </div>
      </div>
    </>
  );
}
