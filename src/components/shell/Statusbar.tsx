// Statusbar — global footer. Server component. Clocks driven by shell.js.

import { getLastFetchedAt } from "@/lib/trending";
// Registry-inclusive count (was getTrackedRepoCount which read only the cold
// trending.json seed). Matches the hero + control-bar pills.
import { getDerivedRepoCount } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { classifyFreshness, type FreshnessStatus } from "@/lib/news/freshness";

// Statusbar's "PIPE" indicator uses LIVE/WARN/COLD (not the canonical
// LIVE/WARM/STALE) because the pipe-health terminology predates the
// freshness pill design. Keep the variant local; no inline ternary.
const PIPE_LABEL: Record<FreshnessStatus, string> = {
  live: "LIVE",
  warn: "WARN",
  cold: "COLD",
};

const PIPE_DOT: Record<FreshnessStatus, string> = {
  live: "up",
  warn: "warn",
  cold: "down",
};

export async function Statusbar() {
  const trackedCount = (() => {
    try {
      return getDerivedRepoCount();
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
      counts.redditPosts
    : 0;

  const status: FreshnessStatus = fresh?.status ?? "cold";
  const dot = PIPE_DOT[status];
  const pipeLabel = PIPE_LABEL[status];

  return (
    <footer className="statusbar">
      <span className="seg">
        <span className={`dot ${dot}`} /> <b>PIPE</b> {pipeLabel}
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
