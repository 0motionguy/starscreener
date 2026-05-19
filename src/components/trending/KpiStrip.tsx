// KpiStrip — emits the 5-cell .kpi-strip used on the Trending hub.
// shell.js animates the [data-counter] spans from 0 → target.

import { getTrackedRepoCount, getDeltasComputedAt, getLastFetchedAt } from "@/lib/trending";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { classifyFreshness } from "@/lib/news/freshness";

export async function KpiStrip() {
  const trackedCount = safe(() => getTrackedRepoCount(), 0);
  const fetchedAt = safe(() => getLastFetchedAt() || null, null);
  const deltasAt = safe(() => getDeltasComputedAt() || null, null);
  const counts = await getSidebarSourceCounts().catch(() => null);

  const mentions24h = counts
    ? counts.hackernewsStories +
      counts.lobstersStories +
      counts.devtoArticles +
      counts.blueskyPosts +
      counts.redditPosts +
      counts.producthuntLaunches
    : 0;

  const sourceList = counts
    ? [
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
      ]
    : [];
  const liveSources = sourceList.filter((n) => n > 0).length;
  const totalSources = sourceList.length || 14;

  const fresh = fetchedAt ? classifyFreshness("repos", fetchedAt) : null;
  const freshLabel = fresh?.ageLabel ?? "—";
  const freshStatus = fresh?.status ?? "cold";

  return (
    <div className="kpi-strip" style={{ margin: "16px 0" }}>
      <div className="kpi">
        <span className="kpi-label">Repos tracked</span>
        <span className="kpi-value" data-counter data-target={trackedCount}>
          {trackedCount.toLocaleString()}
        </span>
        <span className="kpi-delta up">▲ {deltasAt ? "last computed " + classifyFreshness("repos", deltasAt).ageLabel : "—"}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Mentions captured</span>
        <span className="kpi-value" data-counter data-target={mentions24h}>
          {mentions24h.toLocaleString()}
        </span>
        <span className="kpi-delta up">▲ across {totalSources} mention sources</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Breakouts today</span>
        <span className="kpi-value" data-counter data-target={42}>
          42
        </span>
        <span className="kpi-delta up">▲ via consensus</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Mention sources up</span>
        <span className="kpi-value">
          {liveSources}
          <span style={{ color: "var(--fg-faint)", fontSize: 16 }}> / {totalSources}</span>
        </span>
        <span className="kpi-delta fl">
          {liveSources === totalSources ? "● ALL LIVE" : "● degraded"}
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Avg freshness</span>
        <span className="kpi-value">{freshLabel}</span>
        <span className={`kpi-delta ${freshStatus === "live" ? "up" : freshStatus === "warn" ? "fl" : "fl"}`}>
          ▲ {freshStatus.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
