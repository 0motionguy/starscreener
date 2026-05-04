// Daily snapshot of the consensus trending pool.
//
// Reads the live `consensus-trending` payload from Redis (the worker
// publishes hourly at :50) plus `consensus-verdicts` (analyst output
// at :00), and writes both under a date-keyed slot:
//   consensus:YYYY-MM-DD          → ConsensusTrendingPayload
//   consensus-verdicts:YYYY-MM-DD → ConsensusVerdictsPayload
//
// Used by /consensus historical views + Early-Call Hall of Fame
// (walks back N days to find earliest OURS appearance per item).
//
// Run: npx tsx scripts/snapshot-consensus.ts
// Cron: 23:55 UTC daily via .github/workflows/snapshot-consensus.yml

import { getDataStore } from "@/lib/data-store";
import { todayUtcDate } from "@/lib/top10/snapshots";

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90-day retention

async function copyKey(srcKey: string, dstKey: string): Promise<boolean> {
  const store = getDataStore();
  const result = await store.read<unknown>(srcKey);
  if (!result.data || result.source === "missing") {
    console.warn(`[snapshot-consensus] source ${srcKey} missing — skipped`);
    return false;
  }
  await store.write(dstKey, result.data, { ttlSeconds: TTL_SECONDS });
  console.log(`[snapshot-consensus] wrote ${dstKey} ← ${srcKey} (source=${result.source})`);
  return true;
}

async function main(): Promise<void> {
  const date = todayUtcDate();
  console.log(`[snapshot-consensus] start date=${date}`);
  const [trending, verdicts] = await Promise.all([
    copyKey("consensus-trending", `consensus:${date}`),
    copyKey("consensus-verdicts", `consensus-verdicts:${date}`),
  ]);
  if (!trending) {
    console.error("[snapshot-consensus] trending snapshot failed — exiting non-zero");
    process.exit(1);
  }
  if (!verdicts) {
    console.warn("[snapshot-consensus] verdicts not available (analyst pending) — continuing");
  }
  console.log("[snapshot-consensus] done");
}

main().catch((err) => {
  console.error("[snapshot-consensus] FAILED", err);
  process.exit(1);
});
