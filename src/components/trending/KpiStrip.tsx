// KpiStrip — emits the 5-cell .kpi-strip used on the Trending hub.
// shell.js animates the [data-counter] spans from 0 → target.

import { getTrackedRepoCount, getDeltasComputedAt, getLastFetchedAt } from "@/lib/trending";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import { Icon } from "@/lib/icons";

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
        counts.agentRepos,
        counts.twitterRepos,
        counts.arxivPapers,
      ]
    : [];
  const liveSources = sourceList.filter((n) => n > 0).length;
  const totalSources = sourceList.length || 14;

  const fresh = fetchedAt ? classifyFreshness("repos", fetchedAt) : null;
  const freshLabel = fresh?.ageLabel ?? "—";
  const freshStatus = fresh?.status ?? "cold";
  const allLive = liveSources > 0 && liveSources === totalSources;

  return (
    <div className="kpi-strip">
      <div className="kpi">
        <span className="kpi-label">Repos tracked</span>
        <span
          className="kpi-value"
          data-counter
          data-target={trackedCount}
          suppressHydrationWarning
        >
          {trackedCount.toLocaleString()}
        </span>
        <span className="kpi-delta up">
          <Icon name="trending-up" size={11} />
          {deltasAt ? "last computed " + classifyFreshness("repos", deltasAt).ageLabel : "—"}
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Mentions captured</span>
        <span
          className="kpi-value"
          data-counter
          data-target={mentions24h}
          suppressHydrationWarning
        >
          {mentions24h.toLocaleString()}
        </span>
        <span className="kpi-delta up">
          <Icon name="trending-up" size={11} />
          across {totalSources} mention sources
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Breakouts today</span>
        {counts ? (
          <>
            <span
              className="kpi-value"
              data-counter
              data-target={42}
              suppressHydrationWarning
            >
              42
            </span>
            <span className="kpi-delta up">
              <Icon name="trending-up" size={11} />
              via consensus
            </span>
          </>
        ) : (
          <>
            <span className="kpi-value kpi-empty">—</span>
            <span className="kpi-delta fl">awaiting consensus</span>
          </>
        )}
      </div>
      <div className="kpi">
        <span className="kpi-label">Mention sources up</span>
        <span className="kpi-value">
          {liveSources}
          <span className="kpi-value-sub"> / {totalSources}</span>
        </span>
        <span className={`kpi-delta ${allLive ? "up" : "fl"}`}>
          <span className={`live-dot ${allLive ? "live" : "warn"}`} aria-hidden="true" />
          {allLive ? "ALL LIVE" : "degraded"}
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Avg freshness</span>
        <span className="kpi-value">{freshLabel}</span>
        <span className={`kpi-delta ${freshStatus === "live" ? "up" : "fl"}`}>
          <span className={`live-dot ${freshStatus}`} aria-hidden="true" />
          {getStatusLabel(freshStatus).toUpperCase()}
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
