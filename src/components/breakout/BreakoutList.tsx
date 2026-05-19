// BreakoutList — table of .bk-row rows. One row per breakout repo.
//
// Per HTML spec the grid is:
//   [tier mark | repo identity + why | velocity bar | source pips | sparkline | meta]
// Mobile reflows handled in shell.css via the .bk-row @media rules.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import { synthesizeWhy } from "@/lib/why-narrative";

import { MentionSourcePips } from "@/components/trending/MentionSourcePips";
import { RepoSparkline } from "@/components/trending/RepoSparkline";

import type { BreakoutTier } from "./TierHeatStrip";

export interface BreakoutListItem {
  repo: Repo;
  tier: BreakoutTier;
  /** Velocity as percentage (e.g. 24.1). */
  velocityPct: number;
}

interface BreakoutListProps {
  items: BreakoutListItem[];
  /** Total breakouts found vs. displayed (footer copy). */
  totalCount: number;
}

const TIER_MARK_CLASS: Record<BreakoutTier, string> = {
  hot: "",
  warm: "warm",
  early: "neutral",
  emerging: "cool",
};

const VEL_BAR_CLASS: Record<BreakoutTier, string> = {
  hot: "",
  warm: "warm",
  early: "",
  emerging: "cool",
};

function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = stars / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1)}K`;
  }
  return stars.toLocaleString();
}

function formatDelta(d: number): string {
  if (d >= 1000) {
    const k = d / 1000;
    return `+${k.toFixed(k >= 10 ? 0 : 1)}K`;
  }
  return `+${d.toLocaleString()}`;
}

/** Map velocity percentage to the .vel-bar width custom property. */
function velocityToCss(pct: number): string {
  const clamped = Math.max(2, Math.min(100, pct * 4)); // 25% velocity → bar full
  return `${clamped.toFixed(0)}%`;
}

export function BreakoutList({ items, totalCount }: BreakoutListProps) {
  const shown = items.length;

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Top breakouts</b> · 24h · with reasoning
        </h2>
        <span className="grow" />
        <span className="chip up">
          {items.filter((i) => i.tier === "hot").length} hot
        </span>
      </div>

      {items.length === 0 && (
        <div style={{ padding: "24px 16px", color: "var(--fg-muted)", fontSize: 12 }}>
          No breakouts surfaced this window. Either the trending pipeline is cold or all
          tracked repos are below the 4% velocity threshold.
        </div>
      )}

      {items.map((item, idx) => {
        const { repo, tier, velocityPct } = item;
        const [owner, name] = repo.fullName.split("/");
        const detailHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
        const why = synthesizeWhy(repo);
        const tierMarkExtra = TIER_MARK_CLASS[tier];
        const velExtra = VEL_BAR_CLASS[tier];
        const stars = typeof repo.stars === "number" ? repo.stars : 0;
        const delta = typeof repo.starsDelta24h === "number" ? repo.starsDelta24h : 0;

        return (
          <div className="bk-row" key={repo.id ?? repo.fullName}>
            <div className={`bk-tier-mark${tierMarkExtra ? " " + tierMarkExtra : ""}`}>
              {String(idx + 1).padStart(2, "0")}
            </div>

            <div>
              <div className="row gap-2">
                <div
                  className="repo-avatar"
                  style={{
                    width: 24,
                    height: 24,
                    fontSize: 9,
                    background: "var(--surface-3)",
                    color: "var(--accent)",
                  }}
                >
                  {(owner || "?").slice(0, 2).toUpperCase()}
                </div>
                <Link href={detailHref} className="repo-name" prefetch={false}>
                  <span className="muted">{owner}/</span>
                  {name}
                </Link>
                {repo.language && <span className="tag">{repo.language.toUpperCase()}</span>}
                {tier === "emerging" && <span className="tag info">○ EMERGING</span>}
                {tier === "early" && <span className="tag">● EARLY</span>}
                {tier === "warm" && <span className="tag warn">◆ WARM</span>}
              </div>
              <p className="bk-why">
                <b>Why:</b> {why.text}
              </p>
            </div>

            <div className={`bk-vel${velExtra ? " " + velExtra : ""}`}>
              <span>
                +{velocityPct.toFixed(1)}% <span className="up-text">▲</span>
              </span>
              <div
                className="vel-bar"
                style={{ ["--v" as string]: velocityToCss(velocityPct) } as React.CSSProperties}
              />
            </div>

            <div className="bk-sources">
              <MentionSourcePips repo={repo} />
            </div>

            <div className="bk-spark">
              <RepoSparkline repo={repo} variant={delta >= 0 ? "up" : "down"} />
            </div>

            <div className="bk-meta">
              <div className="star">{formatStars(stars)} ★</div>
              <div className="delta">
                {formatDelta(delta)} 24h
              </div>
            </div>
          </div>
        );
      })}

      {items.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <span className="muted" style={{ fontSize: 11 }}>
            Showing {shown.toLocaleString()} of {totalCount.toLocaleString()} breakouts ·
            velocity-weighted
          </span>
        </div>
      )}
    </div>
  );
}
