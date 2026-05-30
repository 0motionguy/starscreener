// BreakoutList - eight populated breakout rows from the v6 HTML reference.

import type { CSSProperties } from "react";

import type { Repo, SocialPlatform } from "@/lib/types";

import { RepoSparkline } from "@/components/trending/RepoSparkline";

import type { BreakoutTier } from "./TierHeatStrip";

export interface BreakoutListItem {
  repo: Repo;
  tier: BreakoutTier;
  velocityPct: number;
  starsDelta: number;
  sources: SocialPlatform[];
  why: string;
  tags: string[];
}

interface BreakoutListProps {
  items: BreakoutListItem[];
  totalCount: number;
  windowLabel: string;
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
  early: "warm",
  emerging: "cool",
};

const SOURCE_MARKS: Partial<Record<SocialPlatform, { cls: string; label: string }>> = {
  github: { cls: "github", label: "G" },
  hackernews: { cls: "hn", label: "H" },
  twitter: { cls: "x", label: "X" },
  reddit: { cls: "reddit", label: "R" },
  bluesky: { cls: "bsky", label: "B" },
  devto: { cls: "devto", label: "D" },
  huggingface: { cls: "hf", label: "F" },
  arxiv: { cls: "arxiv", label: "A" },
  npm: { cls: "npm", label: "N" },
  lobsters: { cls: "lobsters", label: "L" },
};

function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = stars / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1)}K`;
  }
  return stars.toLocaleString();
}

function formatDelta(delta: number): string {
  if (delta >= 1000) {
    const k = delta / 1000;
    return `+${k.toFixed(k >= 10 ? 0 : 1)}K`;
  }
  return `+${delta.toLocaleString()}`;
}

function velocityToCss(pct: number): string {
  const clamped = Math.max(6, Math.min(100, pct * 4));
  return `${clamped.toFixed(0)}%`;
}

function tagClass(tier: BreakoutTier, index: number): string {
  if (tier === "hot" && index === 0) return "brand";
  if (tier === "warm" && index === 0) return "warn";
  if (tier === "emerging" && index === 0) return "info";
  return "";
}

function avatarLabel(owner: string, name: string): string {
  return `${owner[0] ?? ""}${name[0] ?? ""}`.toUpperCase() || "TR";
}

function SourceMarks({ sources }: { sources: SocialPlatform[] }) {
  const visible = sources
    .map((source) => SOURCE_MARKS[source])
    .filter((mark): mark is { cls: string; label: string } => Boolean(mark))
    .slice(0, 5);

  return (
    <>
      {visible.map((mark) => (
        <span key={`${mark.cls}-${mark.label}`} className={`smark ${mark.cls}`}>
          {mark.label}
        </span>
      ))}
    </>
  );
}

export function BreakoutList({
  items,
  totalCount,
  windowLabel,
}: BreakoutListProps) {
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <h2 className="card-title">
          | <b>Top breakouts</b> - {windowLabel} - with reasoning
        </h2>
        <span className="grow" />
        <span className="chip up">
          {items.filter((item) => item.tier === "hot").length} hot
        </span>
      </div>

      {items.map((item, idx) => {
        const { repo, tier, velocityPct, starsDelta } = item;
        const [owner = "", name = repo.fullName] = repo.fullName.split("/");
        const detailHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
        const tierMarkExtra = TIER_MARK_CLASS[tier];
        const velExtra = VEL_BAR_CLASS[tier];
        const stars = typeof repo.stars === "number" ? repo.stars : 0;
        const tags = item.tags.length > 0
          ? item.tags
          : [repo.language ?? "repo", tier].map((tag) => tag.toUpperCase());

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
                  {avatarLabel(owner, name)}
                </div>
                <a href={detailHref} className="repo-name" data-repo-hover data-repo={repo.fullName}>
                  <span className="muted">{owner}/</span>
                  {name}
                </a>
                {tags.slice(0, 2).map((tag, tagIdx) => {
                  const cls = tagClass(tier, tagIdx);
                  return (
                    <span key={`${repo.fullName}-${tag}`} className={`tag${cls ? " " + cls : ""}`}>
                      {tag}
                    </span>
                  );
                })}
              </div>
              <p className="bk-why">
                <b>Why:</b> {item.why}
              </p>
            </div>

            <div className={`bk-vel${velExtra ? " " + velExtra : ""}`}>
              <span>
                +{velocityPct.toFixed(1)}% <span className="up-text">UP</span>
              </span>
              <div
                className="vel-bar"
                style={{ "--v": velocityToCss(velocityPct) } as CSSProperties}
              />
            </div>

            <div className="bk-sources">
              <SourceMarks sources={item.sources} />
            </div>

            <div className="bk-spark">
              <RepoSparkline repo={repo} variant="up" />
            </div>

            <div className="bk-meta">
              <div className="star">{formatStars(stars)} stars</div>
              <div className="delta">
                {formatDelta(starsDelta)} {windowLabel}
              </div>
            </div>
          </div>
        );
      })}

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
          Showing {items.length.toLocaleString()} of {totalCount.toLocaleString()} breakouts -
          velocity-weighted
        </span>
        <span className="chip accent">radar feed</span>
      </div>
    </div>
  );
}
