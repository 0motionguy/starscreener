// Build the top-50 why-narrative cache (AGN-791).
//
// Iterates the top 50 trending repos from getDerivedRepos() (sorted by
// 7d cross-signal score, same ordering /top10 uses, just a wider slice),
// synthesises a 1-2 sentence "why it's trending" caption per repo, and
// persists each under data-store key `repo:<owner>:<name>:why` with a
// 24h TTL.
//
// Run: npx tsx scripts/build-why-narratives.ts
//
// Idempotent — re-running overwrites the previous bundle. Safe to schedule
// on the same cadence as the trending refresh (every ~6h).

import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRecentReposFromStore } from "@/lib/recent-repos";
import {
  buildRepoTop10,
} from "@/lib/top10/builders";
import { closeDataStore } from "@/lib/data-store";
import {
  setWhyNarrative,
  synthesizeWhy,
} from "@/lib/why-narrative";

const TARGET_COUNT = 50;

async function main(): Promise<void> {
  console.log(`[why-narratives] start target=${TARGET_COUNT}`);

  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshRecentReposFromStore(),
  ]);

  const repos = getDerivedRepos();
  if (repos.length === 0) {
    console.warn("[why-narratives] no derived repos available — exiting");
    await closeDataStore();
    return;
  }

  // buildRepoTop10 caps at 10; for top-50 we replicate its sort + slice
  // here. Same cross-signal-7d ordering, just a wider window.
  const sorted = [...repos]
    .filter((r) => !r.archived && !r.deleted)
    .sort((a, b) => {
      const aScore = a.crossSignalScore ?? a.trendScore7d ?? 0;
      const bScore = b.crossSignalScore ?? b.trendScore7d ?? 0;
      if (bScore !== aScore) return bScore - aScore;
      return (b.momentumScore ?? 0) - (a.momentumScore ?? 0);
    })
    .slice(0, TARGET_COUNT);

  // Sanity: confirm our top-10 prefix matches buildRepoTop10's output so
  // the wider slice stays consistent with /top10. Logged, not enforced.
  const top10 = buildRepoTop10(repos, "7d", "cross-signal").items;
  const matchedTop = top10.every(
    (item, i) => sorted[i]?.fullName === item.slug,
  );
  if (!matchedTop) {
    console.warn(
      "[why-narratives] top-10 ordering drift vs buildRepoTop10 — proceeding anyway",
    );
  }

  let written = 0;
  let failed = 0;
  for (const repo of sorted) {
    const [owner, name] = repo.fullName.split("/");
    if (!owner || !name) {
      console.warn(`[why-narratives] skip malformed fullName: ${repo.fullName}`);
      continue;
    }
    try {
      const narrative = synthesizeWhy(repo);
      await setWhyNarrative(owner, name, narrative);
      written += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[why-narratives] write failed ${repo.fullName}: ${msg}`);
    }
  }

  console.log(
    `[why-narratives] done written=${written} failed=${failed} total=${sorted.length}`,
  );

  await closeDataStore();
}

main().catch((err) => {
  console.error("[why-narratives] fatal:", err);
  process.exit(1);
});
