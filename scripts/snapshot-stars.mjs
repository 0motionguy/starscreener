#!/usr/bin/env node
// W2-PROD — Star-snapshot rolling-history producer for the immediate-mode
// deltas pipeline.
//
// PROBLEM
//   src/app/api/pipeline/deltas/route.ts is the CONSUMER of three Redis keys:
//     star-snapshot:24h   star-snapshot:7d   star-snapshot:30d
//   Each holds a `{ items: { "owner/repo": stars_int, ... } }` snapshot
//   from N ago. Without these keys, the route returns prior=null/fresh=false
//   and the home page's 24h/7d/30d delta columns sit at the 4h-lag baseline
//   that the legacy compute-deltas.mjs git-history pipeline produces.
//
// ALGORITHM
//   1. Read the current data/trending.json. Flatten every bucket
//      (period × language) into a single { "owner/repo": stars_int } map,
//      deduping by repo with first-non-empty-stars-wins.
//   2. Maintain a rolling history at Redis key `star-snapshot:hourly-history`:
//      array of { ts: epoch_seconds, items } entries, max 31-day retention
//      (cap ~744 entries).
//   3. On every run: append current snapshot, trim to 31 days, then for each
//      window {24h, 7d, 30d} pick the entry whose `ts` is closest to
//      `now - window_seconds` and write it to the fixed key
//      `star-snapshot:<window>` with TTL = window_seconds + 3600 (so the
//      key never disappears between cron ticks).
//   4. Cold start: when history has fewer entries than the desired window-age,
//      write the OLDEST available entry as the fallback. The consumer's
//      `fresh` flag in the route is computed off `snapshotResult.fresh`
//      (Redis-served vs file/memory) so a cold-start prior is fine — the
//      delta is just narrower than the requested window.
//
// FAILURE MODE
//   Graceful — when REDIS_URL / UPSTASH_* env is missing, _data-store-write.mjs
//   logs a one-shot warning and returns { source: "skipped" }. We exit 0 so
//   the workflow stays green. Production cron always has REDIS_URL.
//
// SCOPE
//   This script only writes Redis. No file mirror. The legacy git-history
//   compute-deltas.mjs continues to produce data/deltas.json until the
//   foreground delete task at the end of phase rips it out.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeDataStore,
  readDataStore,
  closeDataStore,
} from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRENDING_PATH = resolve(ROOT, "data/trending.json");

// 31-day retention so 30d-window picks always have at least one valid
// candidate even if cron skips a tick or two. With hourly cadence the
// list caps at ~744 entries (31 * 24).
const HISTORY_KEY = "star-snapshot:hourly-history";
const HISTORY_MAX_AGE_S = 31 * 24 * 60 * 60;

const WINDOWS = [
  { key: "24h", seconds: 24 * 60 * 60 },
  { key: "7d", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", seconds: 30 * 24 * 60 * 60 },
];

const TTL_GRACE_S = 60 * 60; // 1h grace beyond the window so the key
// survives between cron ticks even if the next tick is a few minutes late.

/**
 * Flatten the trending payload's nested buckets into a single
 * `{ "owner/repo": stars_int }` map. Dedupes across buckets by preferring
 * the first non-empty stars value seen — stars in OSS Insight format are
 * monotonically non-decreasing within a single snapshot, but bucket-level
 * filtering can skip rows entirely (Python-only bucket excludes JS repos),
 * so first-non-empty is enough.
 *
 * Stars on the OSS Insight payload are STRINGS ("12345") — we parse to int
 * so the consumer can subtract without re-coercing.
 */
function buildItemsFromTrending(trendingJson) {
  const items = {};
  const buckets = trendingJson?.buckets;
  if (!buckets || typeof buckets !== "object") return items;

  for (const langMap of Object.values(buckets)) {
    if (!langMap || typeof langMap !== "object") continue;
    for (const rows of Object.values(langMap)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const name = row?.repo_name;
        if (typeof name !== "string" || !name.includes("/")) continue;
        if (items[name] !== undefined) continue; // first-wins
        const raw = row.stars;
        const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
        if (Number.isFinite(n)) {
          items[name] = n;
        }
      }
    }
  }
  return items;
}

/**
 * Load the rolling history. Returns `[]` when the key is missing, when
 * Redis is disabled, or when the value is malformed — every caller treats
 * "no history" as the cold-start case and proceeds.
 */
async function loadHistory() {
  const raw = await readDataStore(HISTORY_KEY);
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  // Defensive shape check — drop malformed entries rather than throw.
  return raw.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof entry.ts === "number" &&
      Number.isFinite(entry.ts) &&
      entry.items &&
      typeof entry.items === "object",
  );
}

/**
 * Pick the entry whose `ts` is closest to targetEpoch. Returns null on an
 * empty list. Linear scan — history caps at ~744 entries so O(n) is fine.
 */
function pickNearest(history, targetEpoch) {
  if (history.length === 0) return null;
  let best = history[0];
  let bestDelta = Math.abs(best.ts - targetEpoch);
  for (let i = 1; i < history.length; i += 1) {
    const d = Math.abs(history[i].ts - targetEpoch);
    if (d < bestDelta) {
      best = history[i];
      bestDelta = d;
    }
  }
  return best;
}

/**
 * Pick the oldest entry — used for cold-start when no entry exists from
 * `target = now - window`. The consumer's `fresh` flag accounts for it.
 */
function pickOldest(history) {
  if (history.length === 0) return null;
  let oldest = history[0];
  for (let i = 1; i < history.length; i += 1) {
    if (history[i].ts < oldest.ts) oldest = history[i];
  }
  return oldest;
}

async function main() {
  const nowMs = Date.now();
  const nowS = Math.floor(nowMs / 1000);

  // ---- 1. Read current trending → build items map ---------------------------
  let trendingRaw;
  try {
    trendingRaw = await readFile(TRENDING_PATH, "utf8");
  } catch (err) {
    console.warn(
      `[snapshot-stars] data/trending.json missing — nothing to snapshot. (${err.message})`,
    );
    return;
  }
  let trendingJson;
  try {
    trendingJson = JSON.parse(trendingRaw);
  } catch (err) {
    console.warn(
      `[snapshot-stars] data/trending.json is not valid JSON: ${err.message}`,
    );
    return;
  }
  const items = buildItemsFromTrending(trendingJson);
  const itemCount = Object.keys(items).length;
  if (itemCount === 0) {
    console.warn(
      "[snapshot-stars] zero repos extracted from trending.json — skipping write",
    );
    return;
  }

  // ---- 2. Append to rolling history + trim ----------------------------------
  const prevHistory = await loadHistory();
  const cutoff = nowS - HISTORY_MAX_AGE_S;
  const trimmed = prevHistory.filter((e) => e.ts >= cutoff);
  trimmed.push({ ts: nowS, items });
  // Sort newest-first so trim/pick are predictable. Not strictly needed
  // for correctness — pickNearest scans linearly — but it makes the value
  // human-readable when inspecting Redis directly.
  trimmed.sort((a, b) => b.ts - a.ts);

  // ---- 3. Write windowed slot keys ------------------------------------------
  const windowResults = [];
  for (const w of WINDOWS) {
    const target = nowS - w.seconds;
    let picked = pickNearest(trimmed, target);
    let basis = "nearest";

    // Cold start: when the picked entry is significantly newer than the
    // target (history is shorter than the window), fall back to the oldest
    // available entry. The consumer relies on `fresh: snapshotResult.fresh
    // && prior !== null`, so a real prior with `fresh=true` from Redis is
    // still acceptable; it just represents a shorter-than-requested window.
    if (picked && picked.ts > target + w.seconds * 0.5) {
      const oldest = pickOldest(trimmed);
      if (oldest && oldest.ts < picked.ts) {
        picked = oldest;
        basis = "cold-start";
      }
    }

    if (!picked) continue;

    const slotKey = `star-snapshot:${w.key}`;
    const ttl = w.seconds + TTL_GRACE_S;
    await writeDataStore(
      slotKey,
      { items: picked.items, ts: picked.ts, basis },
      { ttlSeconds: ttl, stampPerRecord: false },
    );
    windowResults.push({ window: w.key, ts: picked.ts, basis });
  }

  // ---- 4. Persist updated history -------------------------------------------
  // History gets a TTL slightly longer than retention so a stalled cron
  // doesn't lose history forever — Redis will still hold last-known.
  await writeDataStore(HISTORY_KEY, trimmed, {
    ttlSeconds: HISTORY_MAX_AGE_S + TTL_GRACE_S,
    stampPerRecord: false,
  });

  console.log(
    `[snapshot-stars] wrote history (${trimmed.length} entries, ${itemCount} repos in current snapshot)`,
  );
  for (const r of windowResults) {
    console.log(
      `  star-snapshot:${r.window} ← ts=${r.ts} (${r.basis})`,
    );
  }
}

main()
  .catch((err) => {
    console.error(
      "[snapshot-stars] failed:",
      err?.stack ?? err?.message ?? err,
    );
    // Don't fail the workflow — see continue-on-error in the GH Actions step.
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
