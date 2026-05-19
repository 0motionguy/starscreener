// BubbleMap — velocity × consensus bubble chart, server-rendered.
//
//   X axis = 24h velocity (% of stars). 0%-25% maps to left 100-960px.
//   Y axis = active mention sources (0-6+). Higher count → higher on chart
//            (top=460-50px).
//   Size  = total mention volume (28-84px diameter).
//   Color = tier class (.bubble.hot|.warm|.neutral|.cool).
//
// Each bubble is a real <a> link to the rebuilt repo-detail route so the
// chart is keyboard-navigable without client-side JS.

import type { BreakoutTier } from "./TierHeatStrip";

export interface BubblePoint {
  fullName: string;
  /** Short label rendered inside the bubble (≤ 11 chars best). */
  short: string;
  /** Velocity as percentage (e.g. 24.1 for +24.1%). */
  velocityPct: number;
  /** Active mention channels in the last 24h. */
  sourceCount: number;
  /** Total mention volume (24h or 7d, used for radius). */
  mentionVolume: number;
  tier: BreakoutTier;
}

interface BubbleMapProps {
  bubbles: BubblePoint[];
  /** Tier-count summary chips above the chart. */
  hotCount: number;
  warmCount: number;
  emergingCount: number;
}

const TIER_CLASS: Record<BreakoutTier, string> = {
  hot: "hot",
  warm: "warm",
  early: "neutral",
  emerging: "cool",
};

// Map velocity 0..25% to X 100..960 px (matches HTML axis markers).
function velocityToX(pct: number): number {
  const clamped = Math.max(0, Math.min(25, pct));
  return 100 + (clamped / 25) * (960 - 100);
}

// Map source count 0..7 to Y 460..50 (inverted — higher count, higher chart).
function sourcesToY(count: number): number {
  const clamped = Math.max(0, Math.min(7, count));
  return 460 - (clamped / 7) * (460 - 50);
}

// Map mention volume to diameter 28..84 px. Uses log scaling because volumes
// can range from single digits to thousands.
function volumeToDiameter(volume: number): number {
  if (volume <= 0) return 28;
  const log = Math.log10(volume + 1); // 0..~4 for 0..10000 mentions
  const scaled = Math.min(1, log / 3); // cap at 1000 mentions for max bubble
  return Math.round(28 + scaled * (84 - 28));
}

export function BubbleMap({ bubbles, hotCount, warmCount, emergingCount }: BubbleMapProps) {
  return (
    <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="eyebrow">
          ▌ Velocity × consensus map · {bubbles.length.toLocaleString()} breakouts
        </div>
        <div className="row gap-2">
          <span className="chip up">{hotCount} hot</span>
          <span className="chip warn">{warmCount} warm</span>
          <span className="chip info">{emergingCount} emerging</span>
        </div>
      </div>

      <div className="bubble-wrap" role="img" aria-label="Velocity by consensus bubble map">
        {/* Axis labels */}
        <div className="bubble-axis-y">
          MENTIONS ▲
          <br />
          (sources active)
        </div>
        <div className="bubble-axis-x">VELOCITY → (24h %)</div>

        {/* Axis lines */}
        <div className="axis-line x" />
        <div className="axis-line y" />

        {/* Axis tick markers */}
        <div className="axis-label-x" style={{ left: 100 }}>
          +5%
        </div>
        <div className="axis-label-x" style={{ left: 280 }}>
          +10%
        </div>
        <div className="axis-label-x" style={{ left: 480 }}>
          +15%
        </div>
        <div className="axis-label-x" style={{ left: 680 }}>
          +20%
        </div>
        <div className="axis-label-x" style={{ left: 880 }}>
          +25%
        </div>
        <div className="axis-label-y" style={{ top: 50 }}>
          6
        </div>
        <div className="axis-label-y" style={{ top: 150 }}>
          4
        </div>
        <div className="axis-label-y" style={{ top: 250 }}>
          2
        </div>
        <div className="axis-label-y" style={{ top: 380 }}>
          1
        </div>

        {/* Bubbles */}
        {bubbles.map((b) => {
          const [owner, name] = b.fullName.split("/");
          if (!owner || !name) return null;
          const diameter = volumeToDiameter(b.mentionVolume);
          const left = velocityToX(b.velocityPct) - diameter / 2;
          const top = sourcesToY(b.sourceCount) - diameter / 2;
          const cls = TIER_CLASS[b.tier];
          const title = `${b.fullName} — +${b.velocityPct.toFixed(1)}% velocity · ${b.sourceCount} sources · ${b.mentionVolume.toLocaleString()} mentions`;
          return (
            <a
              key={b.fullName}
              className={`bubble ${cls}`}
              style={{ left, top, width: diameter, height: diameter }}
              href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
              title={title}
            >
              <span className="bubble-name">{b.short}</span>
              {b.velocityPct >= 1 && (
                <span className="bubble-delta">+{Math.round(b.velocityPct)}%</span>
              )}
            </a>
          );
        })}

        {/* Legend */}
        <div className="bubble-legend">
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--accent)" }} /> Hot · ≥15%
            velocity
          </div>
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--warning)" }} /> Warm · 8–15%
          </div>
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--fg-subtle)" }} /> Early · 4–8%
          </div>
          <div className="lg-row">
            <span className="lg-dot" style={{ background: "var(--info)" }} /> Emerging ·
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
