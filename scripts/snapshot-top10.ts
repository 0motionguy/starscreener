// Daily snapshot of the /top10 page.
//
// Mirrors the data-fetch sequence in src/app/top10/page.tsx exactly so the
// frozen snapshot matches what the live page would have rendered at the
// snapshot moment. Run as: npx tsx scripts/snapshot-top10.ts
//
// Cadence: 23:55 UTC daily via .github/workflows/snapshot-top10.yml.

// Patches require.cache for `server-only` BEFORE any @/lib transitive
// imports trigger it. Must stay the first import.
import "./_server-only-shim";

import { getDerivedRepos } from "@/lib/derived-repos";
import {
  getHnTopStories,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  getBlueskyTopPosts,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  getDevtoTopArticles,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import {
  getLobstersTopStories,
  refreshLobstersTrendingFromStore,
} from "@/lib/lobsters-trending";
import {
  getRecentLaunches,
  refreshProducthuntLaunchesFromStore,
} from "@/lib/producthunt";
import {
  getFundingSignalsThisWeek,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import {
  buildAgentTop10,
  buildFundingTop10,
  buildMoversTop10,
  buildNewsTop10,
  buildRepoTop10,
  emptyBundle,
} from "@/lib/top10/builders";
import { writeTop10Snapshot, todayUtcDate } from "@/lib/top10/snapshots";
import type { Top10Payload } from "@/lib/top10/types";
import { closeDataStore } from "@/lib/data-store";

async function main(): Promise<void> {
  const date = todayUtcDate();
  console.log(`[snapshot-top10] start date=${date}`);

  await Promise.allSettled([
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
  ]);

  const repos = getDerivedRepos();
  const hn = getHnTopStories(40);
  const bsky = getBlueskyTopPosts(40);
  const devto = getDevtoTopArticles(40);
  const lobsters = getLobstersTopStories(40);
  const ph = getRecentLaunches(7, 40);
  const funding = getFundingSignalsThisWeek();

  const payload: Top10Payload = {
    repos: repos.length > 0 ? buildRepoTop10(repos, "7d") : emptyBundle("7d"),
    llms: emptyBundle("7d"),
    agents: repos.length > 0 ? buildAgentTop10(repos, "7d") : emptyBundle("7d"),
    movers:
      repos.length > 0 ? buildMoversTop10(repos, "24h") : emptyBundle("24h"),
    news: buildNewsTop10({
      hn,
      bluesky: bsky,
      devto,
      lobsters,
      producthunt: ph,
    }),
    funding: funding.length > 0 ? buildFundingTop10(funding) : emptyBundle("7d"),
  };

  // Per-category summary so the GHA log makes blackouts (zero-item categories)
  // obvious without grepping the JSON.
  const summary = (Object.keys(payload) as (keyof Top10Payload)[])
    .map((k) => `${k}=${payload[k].items.length}`)
    .join(" ");
  console.log(`[snapshot-top10] payload ${summary}`);

  await writeTop10Snapshot(date, payload);
  console.log(`[snapshot-top10] wrote key=top10:${date} ok`);
}

main()
  .then(async () => {
    await closeDataStore();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[snapshot-top10] FAILED", err);
    await closeDataStore();
    process.exit(1);
  });
