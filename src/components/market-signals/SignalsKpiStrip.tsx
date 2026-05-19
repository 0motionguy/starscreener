// SignalsKpiStrip — 5 KPI cells for the Market Signals cockpit.
// Emits the `.kpi-strip` chrome already styled by shell.css. shell.js
// animates the [data-counter] values on mount.

import type { SidebarSourceCounts } from "@/lib/sidebar-source-counts";

interface SignalsKpiStripProps {
  counts: SidebarSourceCounts | null;
  /** Repos with >=5 distinct mention sources firing in 24h. */
  crossSourceCount: number;
  /** NPM packages with positive 7d trend score. */
  npmAccelerating: number;
  /** arXiv papers ingested (recent feed). */
  arxivPapers: number;
  /** arXiv papers with linkedRepos (cited→repo matches). */
  citedRepos: number;
}

export function SignalsKpiStrip({
  counts,
  crossSourceCount,
  npmAccelerating,
  arxivPapers,
  citedRepos,
}: SignalsKpiStripProps) {
  const mentions24h = counts
    ? counts.hackernewsStories +
      counts.lobstersStories +
      counts.devtoArticles +
      counts.blueskyPosts +
      counts.redditPosts +
      counts.producthuntLaunches
    : 0;

  return (
    <div className="kpi-strip" style={{ margin: "16px 0" }}>
      <div className="kpi">
        <span className="kpi-label">Mentions · 24h</span>
        <span className="kpi-value" data-counter data-target={mentions24h}>
          {mentions24h.toLocaleString()}
        </span>
        <span className="kpi-delta up">▲ across {totalSourceCount(counts)} feeds</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Cross-source · 5+</span>
        <span className="kpi-value" data-counter data-target={crossSourceCount}>
          {crossSourceCount.toLocaleString()}
        </span>
        <span className="kpi-delta up">▲ repos firing ≥5 sources</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">arXiv ingested</span>
        <span className="kpi-value" data-counter data-target={arxivPapers}>
          {arxivPapers.toLocaleString()}
        </span>
        <span className="kpi-delta fl">papers in recent feed</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">NPM accelerating</span>
        <span className="kpi-value" data-counter data-target={npmAccelerating}>
          {npmAccelerating.toLocaleString()}
        </span>
        <span className="kpi-delta up">▲ positive 7d trend</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Cited → repo</span>
        <span className="kpi-value" data-counter data-target={citedRepos}>
          {citedRepos.toLocaleString()}
        </span>
        <span className="kpi-delta fl">arXiv papers w/ linked repo</span>
      </div>
    </div>
  );
}

function totalSourceCount(counts: SidebarSourceCounts | null): number {
  if (!counts) return 0;
  const list = [
    counts.hackernewsStories,
    counts.lobstersStories,
    counts.devtoArticles,
    counts.blueskyPosts,
    counts.redditPosts,
    counts.producthuntLaunches,
    counts.fundingSignals,
    counts.npmPackages,
    counts.skillsItems,
    counts.mcpItems,
    counts.agentRepos,
    counts.twitterRepos,
    counts.hfModels,
    counts.arxivPapers,
  ];
  return list.filter((n) => n > 0).length;
}
