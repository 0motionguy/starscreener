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

import { closeDataStore, getDataStore } from "@/lib/data-store";
import { todayUtcDate } from "@/lib/top10/snapshots";

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90-day retention

// Default freshness budget for the source consensus-trending payload. The
// worker publishes hourly at :50, so anything older than ~6h means the
// upstream collector is wedged and we should NOT freeze that staleness
// into a date-keyed snapshot — the consumer (Early-Call Hall of Fame,
// /consensus history) would carry it forward for 90 days.
const DEFAULT_MAX_AGE_HOURS = 6;

/**
 * Refuse to snapshot when the source `consensus-trending` payload is older
 * than `SNAPSHOT_MAX_AGE_HOURS` (default 6h). Exits 1 on:
 *   - missing payload
 *   - missing / unparseable writtenAt
 *   - payload age > maxAgeHours
 *   - negative SNAPSHOT_MAX_AGE_HOURS env value
 */
async function assertConsensusTrendingFresh(): Promise<void> {
  const rawMax = process.env.SNAPSHOT_MAX_AGE_HOURS;
  const maxAgeHours =
    rawMax === undefined || rawMax === ""
      ? DEFAULT_MAX_AGE_HOURS
      : Number(rawMax);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
    throw new Error(
      `[snapshot-consensus] ABORT: SNAPSHOT_MAX_AGE_HOURS=${rawMax} is not a valid non-negative number`,
    );
  }

  const store = getDataStore();
  const result = await store.read<unknown>("consensus-trending");
  if (!result.data || result.source === "missing") {
    console.error(
      "[snapshot-consensus] ABORT: consensus-trending payload missing — refusing to snapshot",
    );
    process.exit(1);
  }

  const writtenAt = result.writtenAt ?? null;
  if (!writtenAt) {
    console.error(
      "[snapshot-consensus] ABORT: consensus-trending payload has no writtenAt — refusing to snapshot",
    );
    process.exit(1);
  }
  const writtenAtMs = new Date(writtenAt).getTime();
  if (!Number.isFinite(writtenAtMs)) {
    console.error(
      `[snapshot-consensus] ABORT: consensus-trending writtenAt=${writtenAt} is not parseable — refusing to snapshot`,
    );
    process.exit(1);
  }

  const ageHours = (Date.now() - writtenAtMs) / 3600000;
  if (ageHours > maxAgeHours) {
    console.error(
      `[snapshot-consensus] ABORT: consensus-trending payload is ${ageHours.toFixed(
        1,
      )}h stale (max=${maxAgeHours}h). Refusing to snapshot.`,
    );
    process.exit(1);
  }
  console.log(
    `[snapshot-consensus] freshness ok: consensus-trending age=${ageHours.toFixed(
      1,
    )}h (max=${maxAgeHours}h)`,
  );
}

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
  await assertConsensusTrendingFresh();
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

main()
  .then(async () => {
    await closeDataStore();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[snapshot-consensus] FAILED", err);
    await closeDataStore();
    process.exit(1);
  });
