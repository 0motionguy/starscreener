#!/usr/bin/env node
// W5-CATWINDOW — Category-metrics rolling-history producer.
//
// Mirrors scripts/snapshot-stars.mjs exactly. Writes per-category
// total-stars snapshots into Redis windowed slots so the /categories surface
// can render 24h / 7d / 30d deltas without recomputing from raw repo data.
//
// KEYS
//   category-metrics-snapshot:hourly-history   rolling history (max 31d)
//   category-metrics-snapshot:24h              window slot
//   category-metrics-snapshot:7d               window slot
//   category-metrics-snapshot:30d              window slot
//
// PAYLOAD SHAPE
//   { items: { "<category-id>": metric_value, ... }, ts: epoch_seconds, basis }
//
// METRIC
//   total stars across all repos in the category. Mirrors the repo-side
//   star-snapshot flow — keeps the producer simple, comparable, and the
//   reader trivial.
//
// SOURCE
//   data/trending.json — same input as snapshot-stars.mjs. Each row carries
//   a `topics` field; we map a row to its category via the same regex/keyword
//   rules used in src/lib/derived-repos.ts. Doing the categorization here
//   keeps the script self-contained (no TS imports) and matches the canonical
//   CATEGORIES set defined in src/lib/constants.ts (kept in sync via the
//   inline copy below — drift guarded by the CATEGORY_IDS list at top).
//
// FAILURE MODE
//   Graceful — when REDIS_URL / UPSTASH_* env is missing, _data-store-write.mjs
//   logs a one-shot warning and returns { source: "skipped" }. Workflow stays
//   green via continue-on-error.

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

const HISTORY_KEY = "category-metrics-snapshot:hourly-history";
const HISTORY_MAX_AGE_S = 31 * 24 * 60 * 60;

const WINDOWS = [
  { key: "24h", seconds: 24 * 60 * 60 },
  { key: "7d", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", seconds: 30 * 24 * 60 * 60 },
];

const TTL_GRACE_S = 60 * 60;

// Category id list mirrors src/lib/constants.ts CATEGORIES. Inline so the
// .mjs script needs no transpile step. If the canonical list grows, the
// missing categories simply emit zero — no crash.
const CATEGORY_IDS = [
  "ai-ml",
  "web-frameworks",
  "devtools",
  "infra",
  "databases",
  "security",
  "mobile",
  "data",
  "crypto",
  "rust",
];

// Lightweight category resolver. Mirrors the topic/keyword classification
// scheme used by src/lib/derived-repos.ts. We don't need exact parity — we
// just need enough signal to allocate stars to the right bucket. Worst-case
// drift is that some repos get bucketed slightly differently between the
// reader and this producer; the resulting delta number is still useful as
// a sector-level momentum proxy.
function resolveCategoryId(row) {
  const topics = Array.isArray(row?.topics) ? row.topics : [];
  const lc = (s) => (typeof s === "string" ? s.toLowerCase() : "");
  const lang = lc(row?.language ?? row?.primary_language);
  const tset = new Set(topics.map(lc));
  const text = [
    row?.repo_name,
    row?.description,
    row?.collection_names,
    row?.primary_language,
    row?.language,
    ...topics,
  ]
    .map(lc)
    .filter(Boolean)
    .join(" ");
  const has = (t) => tset.has(t) || text.includes(t);

  if (
    has("ai") || has("ml") || has("llm") || has("llms") ||
    has("machine-learning") || has("deep-learning") || has("artificial-intelligence") ||
    has("neural-network") || has("transformers") || has("openai") || has("gpt") ||
    has("agent") || has("agents")
  )
    return "ai-ml";
  if (
    has("web") || has("framework") || has("react") || has("vue") || has("svelte") ||
    has("nextjs") || has("angular") || has("frontend")
  )
    return "web-frameworks";
  if (
    has("cli") || has("devtools") || has("tooling") || has("developer-tools") ||
    has("editor") || has("ide")
  )
    return "devtools";
  if (
    has("infrastructure") || has("infra") || has("kubernetes") || has("docker") ||
    has("devops") || has("cloud") || has("serverless")
  )
    return "infra";
  if (
    has("database") || has("sql") || has("postgres") || has("mysql") || has("redis") ||
    has("mongodb") || has("orm")
  )
    return "databases";
  if (
    has("security") || has("crypto-security") || has("authentication") ||
    has("auth") || has("oauth") || has("vulnerability")
  )
    return "security";
  if (
    has("mobile") || has("ios") || has("android") || has("react-native") ||
    has("flutter") || has("swift")
  )
    return "mobile";
  if (
    has("data") || has("analytics") || has("etl") || has("data-engineering") ||
    has("dataframe") || has("pandas")
  )
    return "data";
  if (
    has("blockchain") || has("crypto") || has("ethereum") || has("bitcoin") ||
    has("web3") || has("solana")
  )
    return "crypto";
  if (lang === "rust" || has("rust")) return "rust";
  return null;
}

/**
 * Aggregate trending payload into a per-category total-stars map. Repos are
 * deduped across buckets by repo_name (first-non-empty wins) before being
 * summed into their category bucket — mirrors the dedupe in
 * snapshot-stars.mjs so the two snapshots agree on the universe.
 */
function buildItemsFromTrending(trendingJson) {
  const buckets = trendingJson?.buckets;
  if (!buckets || typeof buckets !== "object") return {};

  // Step 1: dedupe repos across buckets, capturing { stars, topics, language }.
  const seen = new Map();
  for (const langMap of Object.values(buckets)) {
    if (!langMap || typeof langMap !== "object") continue;
    for (const rows of Object.values(langMap)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const name = row?.repo_name;
        if (typeof name !== "string" || !name.includes("/")) continue;
        if (seen.has(name)) continue; // first-wins
        const raw = row?.stars;
        const stars = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
        if (!Number.isFinite(stars)) continue;
        seen.set(name, {
          repo_name: name,
          stars,
          description: typeof row?.description === "string" ? row.description : "",
          collection_names:
            typeof row?.collection_names === "string" ? row.collection_names : "",
          topics: Array.isArray(row?.topics) ? row.topics : [],
          language:
            typeof row?.language === "string"
              ? row.language
              : typeof row?.primary_language === "string"
                ? row.primary_language
                : "",
        });
      }
    }
  }

  // Step 2: bucket into categories.
  const items = Object.create(null);
  for (const id of CATEGORY_IDS) items[id] = 0;

  for (const repo of seen.values()) {
    const cat = resolveCategoryId(repo);
    if (!cat) continue;
    items[cat] = (items[cat] ?? 0) + repo.stars;
  }
  return items;
}

async function loadHistory() {
  const raw = await readDataStore(HISTORY_KEY);
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
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

  let trendingRaw;
  try {
    trendingRaw = await readFile(TRENDING_PATH, "utf8");
  } catch (err) {
    console.warn(
      `[snapshot-category-metrics] data/trending.json missing — nothing to snapshot. (${err.message})`,
    );
    return;
  }
  let trendingJson;
  try {
    trendingJson = JSON.parse(trendingRaw);
  } catch (err) {
    console.warn(
      `[snapshot-category-metrics] data/trending.json is not valid JSON: ${err.message}`,
    );
    return;
  }
  const items = buildItemsFromTrending(trendingJson);
  const populatedCount = Object.values(items).filter((v) => v > 0).length;
  if (populatedCount === 0) {
    console.warn(
      "[snapshot-category-metrics] zero categories populated — skipping write",
    );
    return;
  }

  const prevHistory = await loadHistory();
  const cutoff = nowS - HISTORY_MAX_AGE_S;
  const trimmed = prevHistory.filter((e) => e.ts >= cutoff);
  trimmed.push({ ts: nowS, items });
  trimmed.sort((a, b) => b.ts - a.ts);

  const windowResults = [];
  for (const w of WINDOWS) {
    const target = nowS - w.seconds;
    let picked = pickNearest(trimmed, target);
    let basis = "nearest";

    if (picked && picked.ts > target + w.seconds * 0.5) {
      const oldest = pickOldest(trimmed);
      if (oldest && oldest.ts < picked.ts) {
        picked = oldest;
        basis = "cold-start";
      }
    }

    if (!picked) continue;

    const slotKey = `category-metrics-snapshot:${w.key}`;
    const ttl = w.seconds + TTL_GRACE_S;
    await writeDataStore(
      slotKey,
      { items: picked.items, ts: picked.ts, basis },
      { ttlSeconds: ttl, stampPerRecord: false },
    );
    windowResults.push({ window: w.key, ts: picked.ts, basis });
  }

  await writeDataStore(HISTORY_KEY, trimmed, {
    ttlSeconds: HISTORY_MAX_AGE_S + TTL_GRACE_S,
    stampPerRecord: false,
  });

  console.log(
    `[snapshot-category-metrics] wrote history (${trimmed.length} entries, ${populatedCount}/${CATEGORY_IDS.length} categories populated)`,
  );
  for (const r of windowResults) {
    console.log(
      `  category-metrics-snapshot:${r.window} ← ts=${r.ts} (${r.basis})`,
    );
  }
}

main()
  .catch((err) => {
    console.error(
      "[snapshot-category-metrics] failed:",
      err?.stack ?? err?.message ?? err,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
