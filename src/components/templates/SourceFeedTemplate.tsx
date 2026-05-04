// V4 — SourceFeedTemplate
//
// Layout primitive consumed by W7 (source-feeds-v4): one template, 13
// pages (HN trending, Reddit, Bluesky, Dev.to, Lobsters, ProductHunt,
// Twitter, NPM, arXiv, Papers, HuggingFace ×3, Breakouts).
//
// Mockup reference: design/screenshots/* + sub-pages.html § /hackernews.
//
// The template handles:
//   - PageHead with crumb / title / lede / clock
//   - Snapshot + Volume + Topics 3-column strip
//   - Featured 3-card row with #1 lead treatment
//   - Main list (table OR card grid)
//
// All content slots are nodes — caller composes with V4 primitives
// (PanelHead, KpiBand, RankRow, FeaturedCard, etc.). Template is purely
// structural; no data fetching, no business logic.
//
// Usage:
//   <SourceFeedTemplate
//     crumb={<><b>HN</b> · TERMINAL · /HACKERNEWS</>}
//     title="Hacker News · trending"
//     lede="Stories from the past 72 hours, scored by velocity..."
//     clock={<LiveClock />}
//     snapshot={<SnapshotPanel ... />}
//     volume={<VolumePanel ... />}
//     topics={<TopicsPanel ... />}
//     featured={[<FeaturedCard ... />, ...]}
//     list={<table>...</table>}
//   />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";

export interface SourceFeedTemplateProps {
  // PageHead slots
  crumb?: ReactNode;
  title?: ReactNode;
  lede?: ReactNode;
  clock?: ReactNode;

  // Top strip — 3 panels: Snapshot · Volume · Topics
  snapshot?: ReactNode;
  volume?: ReactNode;
  topics?: ReactNode;

  // Featured cards (3 expected; #1 emphasized via FeaturedCard's `lead` prop)
  featured?: ReactNode[];
  featuredEyebrow?: ReactNode;

  // Main list — typically a <table> or list of <RankRow>s
  listEyebrow?: ReactNode;
  list?: ReactNode;

  /** Optional ticker/foot strip (e.g. live wire). */
  foot?: ReactNode;
  className?: string;
}

export function SourceFeedTemplate({
  crumb,
  title,
  lede,
  clock,
  snapshot,
  volume,
  topics,
  featured,
  featuredEyebrow = "FEATURED · TODAY",
  listEyebrow = "LIST · TOP 50",
  list,
  foot,
  className,
}: SourceFeedTemplateProps) {
  const hasTopStrip = snapshot || volume || topics;
  const hasFeatured = featured && featured.length > 0;
  return (
    <div className={cn("v4-source-feed-template", className)}>
      <PageHead crumb={crumb} h1={title} lede={lede} clock={clock} />

      {hasTopStrip ? (
        <section className="v4-source-feed-template__strip">
          {snapshot ? <div>{snapshot}</div> : null}
          {volume ? <div>{volume}</div> : null}
          {topics ? <div>{topics}</div> : null}
        </section>
      ) : null}

      {hasFeatured ? (
        <>
          <SectionHead num="// 02" title={featuredEyebrow} />
          <div className="v4-source-feed-template__featured">
            {featured.map((card, i) => (
              <div key={i}>{card}</div>
            ))}
          </div>
        </>
      ) : null}

      {list ? (
        <>
          <SectionHead num="// 03" title={listEyebrow} />
          <div className="v4-source-feed-template__list">{list}</div>
        </>
      ) : null}

      {foot ? <div className="v4-source-feed-template__foot">{foot}</div> : null}
    </div>
  );
}
