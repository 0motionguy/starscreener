// Statusbar — global footer. Server component. Clocks driven by shell.js.

import { getTrackedRepoCount, getLastFetchedAt } from "@/lib/trending";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { classifyFreshness } from "@/lib/news/freshness";

export async function Statusbar() {
  const trackedCount = (() => {
    try {
      return getTrackedRepoCount();
    } catch {
      return 0;
    }
  })();
  const lastFetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();
  const fresh = lastFetchedAt ? classifyFreshness("repos", lastFetchedAt) : null;
  const counts = await getSidebarSourceCounts().catch(() => null);

  // "Mentions" totals — sum of social feed counts.
  const mentions = counts
    ? counts.hackernewsStories +
      counts.lobstersStories +
      counts.devtoArticles +
      counts.blueskyPosts +
      counts.redditPosts +
      counts.producthuntLaunches
    : 0;

  const dot = fresh?.status === "live" ? "up" : fresh?.status === "warn" ? "warn" : "down";

  return (
    <footer className="statusbar">
      <span className="seg">
        <span className={`dot ${dot}`} /> <b>PIPE</b> {fresh?.status === "live" ? "LIVE" : fresh?.status === "warn" ? "WARN" : "COLD"}
      </span>
      <span className="seg">
        <b>LAST SCAN</b> {fresh?.ageLabel ?? "—"}
      </span>
      <span className="seg">
        <b>REPOS</b> {trackedCount.toLocaleString()}
      </span>
      <span className="seg">
        <b>MENTIONS</b> {mentions.toLocaleString()}
      </span>
      <span className="seg grow" />
      <span className="seg">
        <b>UTC</b> <span data-clock="utc">--:--:--</span>
      </span>
      <span className="seg">
        <b>LOCAL</b> <span data-clock="local">--:--:--</span>
      </span>
    </footer>
  );
}
