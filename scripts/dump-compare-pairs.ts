// Regenerates the curated compare-pairs snapshot the editorial-compare worker
// fetcher iterates: apps/trendingrepo-worker/src/fetchers/editorial-compare/pairs.json.
//
// WHY a committed snapshot: the worker is a separate package and can't import
// app code, and it has no category classifier — pair selection (in-category
// top-N where both repos carry a verdict) lives ONLY in the app
// (selectComparablePairs). This script is the single source of that selection
// truth; the worker just iterates the committed artifact and grounds prose on
// the verdicts it reads by fullName. Re-run when the curated set drifts:
//
//   tsx --require ./tests/setup-server-only-stub.cjs scripts/dump-compare-pairs.ts
//
// Run against prod Redis (REDIS_URL / UPSTASH_* set) for the freshest set, or
// locally against bundled JSON for a baseline. The worker + page both gate
// downstream (skip a pair whose verdict is missing; 404 if a repo is gone), so
// a slightly-stale snapshot degrades safely.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import { refreshConsensusVerdictsFromStore } from "@/lib/consensus-verdicts";
import { selectComparablePairs } from "@/lib/compare-pairs";

const OUT = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/editorial-compare/pairs.json",
);

async function main(): Promise<void> {
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
  ]);

  const pairs = selectComparablePairs(5);
  // Stable order so the committed artifact diffs cleanly run-to-run.
  pairs.sort((x, y) =>
    `${x.a}__vs__${x.b}`.localeCompare(`${y.a}__vs__${y.b}`),
  );

  writeFileSync(OUT, `${JSON.stringify(pairs, null, 2)}\n`, "utf8");
  console.log(`[dump-compare-pairs] wrote ${pairs.length} pairs → ${OUT}`);
}

main().catch((err) => {
  console.error("[dump-compare-pairs] failed:", err);
  process.exit(1);
});
