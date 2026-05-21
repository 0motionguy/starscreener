// CompareHero — eyebrow + title + selected-count + FreshnessPill for
// /tools/compare. Server Component, mirrors the TierHero shape so the
// chrome reads consistently across tool routes.

import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";
import { ShareCTAButton } from "@/components/tools/hub/ShareCTAButton";

interface Props {
  selectedCount: number;
  maxCount: number;
  fetchedAt: string | null;
  hasRepos: boolean;
}

export function CompareHero({ selectedCount, maxCount, fetchedAt, hasRepos }: Props) {
  return (
    <header className="cmp-hero">
      <div className="cmp-hero-eyebrow">
        <Link href="/tools" className="cmp-hero-back">
          {"// TOOLS"}
        </Link>
        <span className="cmp-hero-sep">·</span>
        <span className="cmp-hero-eyebrow-num">03 / COMPARE</span>
        <span className="cmp-hero-fresh">
          <FreshnessPill source="repos" fetchedAt={fetchedAt} />
        </span>
        <span style={{ marginLeft: 8 }}>
          <ShareCTAButton
            size="sm"
            shareText={
              hasRepos
                ? `Head-to-head: ${selectedCount} open-source repos compared on stars, velocity, mentions, and tier.`
                : "Stack open-source repos head-to-head on TrendingRepo's compare tool."
            }
            hashtags={["opensource", "github"]}
          />
        </span>
      </div>

      <h1 className="cmp-hero-title">
        Head-to-head
        <span className="cmp-hero-title-accent">.</span>
      </h1>
      <p className="cmp-hero-sub">
        Stack up to {maxCount} tracked repos across the same 10 metrics — stars,
        weekly + monthly velocity, cross-source mentions, category, language,
        first observed, last commit, and a live S/A/B/C/D tier read.
      </p>

      <div className="cmp-hero-meta">
        <div className="cmp-hero-stat">
          <span className="cmp-hero-stat-label">SELECTED</span>
          <span className="cmp-hero-stat-value">
            {selectedCount}
            <span className="cmp-hero-stat-suffix"> of {maxCount} max</span>
          </span>
        </div>
        <div className="cmp-hero-stat">
          <span className="cmp-hero-stat-label">PLAN</span>
          <span className="cmp-hero-stat-value">
            FREE
            <span className="cmp-hero-stat-suffix"> · 2 repos · PRO unlocks 4–6</span>
          </span>
        </div>
        <div className="cmp-hero-stat">
          <span className="cmp-hero-stat-label">STATE</span>
          <span className="cmp-hero-stat-value">
            READY
            <span className="cmp-hero-stat-suffix">
              {hasRepos ? " · table populated" : " · pick a preset below"}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
