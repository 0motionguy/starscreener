// Daily sparkline-point capture for non-repo Top 10 categories.
//
// For each of LLMS / MCPS / SKILLS / NEWS / FUNDING, append today's value
// per slug to the per-category ring buffer in `src/lib/top10/sparkline-store`.
// After ~7 days of runs, /top10 starts painting real sparklines on those
// categories instead of the current empty cells.
//
// Run as: npx tsx scripts/snapshot-top10-sparklines.ts
// Cadence: 23:50 UTC daily, just before the bundle snapshot at 23:55.

import { getHfModelsTrending, refreshHfModelsFromStore } from "@/lib/huggingface";
import {
  getMcpSignalData,
  getSkillsSignalData,
} from "@/lib/ecosystem-leaderboards";
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
import { appendSparklinePoint } from "@/lib/top10/sparkline-store";
import { buildNewsTop10 } from "@/lib/top10/builders";
import { closeDataStore } from "@/lib/data-store";

async function main(): Promise<void> {
  console.log("[snapshot-sparklines] start");

  await Promise.allSettled([
    refreshHfModelsFromStore(),
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
  ]);

  let writes = 0;

  // ---------- LLMS — HF download counts ----------
  const llms = getHfModelsTrending(20);
  for (const m of llms) {
    if (typeof m.downloads === "number") {
      await appendSparklinePoint("llms", m.id, m.downloads);
      writes++;
    }
  }

  // ---------- MCPS — signalScore ----------
  const mcpRes = await getMcpSignalData().catch(() => null);
  const mcpItems = mcpRes?.board.items.slice(0, 20) ?? [];
  for (const it of mcpItems) {
    if (typeof it.signalScore === "number") {
      await appendSparklinePoint("mcps", it.id, it.signalScore);
      writes++;
    }
  }

  // ---------- SKILLS — signalScore ----------
  const skillsRes = await getSkillsSignalData().catch(() => null);
  const skillItems = skillsRes?.combined.items.slice(0, 20) ?? [];
  for (const it of skillItems) {
    if (typeof it.signalScore === "number") {
      await appendSparklinePoint("skills", it.id, it.signalScore);
      writes++;
    }
  }

  // ---------- NEWS — fused per-source-normalized score ----------
  // Run the same fusion the live page uses, then append today's value per
  // resulting slug. Tomorrow's run captures the next day's snapshot under
  // the same slug → sparkline.
  const newsBundle = buildNewsTop10({
    hn: getHnTopStories(40),
    bluesky: getBlueskyTopPosts(40),
    devto: getDevtoTopArticles(40),
    lobsters: getLobstersTopStories(40),
    producthunt: getRecentLaunches(7, 40),
  });
  for (const it of newsBundle.items) {
    await appendSparklinePoint("news", it.slug, it.score);
    writes++;
  }

  // ---------- FUNDING — extracted USD amount ----------
  for (const s of getFundingSignalsThisWeek().slice(0, 20)) {
    const amount = s.extracted?.amount;
    if (typeof amount === "number" && amount > 0) {
      await appendSparklinePoint("funding", s.id, amount);
      writes++;
    }
  }

  console.log(`[snapshot-sparklines] wrote=${writes} ok`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[snapshot-sparklines] FAILED", err);
    process.exit(1);
  });
