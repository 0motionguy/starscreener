#!/usr/bin/env node
// Fetch OSS Insight trending repos, hot collections, and curated collection
// ranking snapshots, then persist them to committed JSON files. No auth; OSS
// Insight allows 600 req/hr per IP. We throttle between calls to stay polite.

import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const PERIODS = ["past_24_hours", "past_week", "past_month"];
const LANGUAGES = ["All", "Python", "TypeScript", "Rust", "Go"];
const TRENDS_PAUSE_MS = 1500;
const COLLECTIONS_PAUSE_MS = 400;
const COLLECTION_RANKING_PERIOD = "past_28_days";
const COLLECTION_RANKING_METRICS = ["stars", "issues"];
const TRENDS_URL = "https://api.ossinsight.io/v1/trends/repos/";
const HOT_COLLECTIONS_URL = "https://api.ossinsight.io/v1/collections/hot/";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRENDS_OUT = resolve(__dirname, "..", "data", "trending.json");
const HOT_COLLECTIONS_OUT = resolve(__dirname, "..", "data", "hot-collections.json");
const COLLECTIONS_ROOT = resolve(__dirname, "..", "data", "collections");
const COLLECTION_RANKINGS_OUT = resolve(__dirname, "..", "data", "collection-rankings.json");

const args = new Set(process.argv.slice(2));
const fetchTrendBuckets = !args.has("--only-collection-rankings");
const fetchCollectionRankings = !args.has("--skip-collection-rankings");

if (!fetchTrendBuckets && !fetchCollectionRankings) {
  throw new Error(
    "invalid flags: choose either --skip-collection-rankings or --only-collection-rankings, not both",
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function expectRows(body, label) {
  const rows = body?.data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${label}: malformed response (no data.rows array)`);
  }
  return rows;
}

function toNumber(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFloat(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url, label) {
  try {
    return await fetchJsonWithRetry(url, {
      headers: { Accept: "application/json" },
      timeoutMs: 15_000,
      attempts: 3,
      retryDelayMs: 750,
    });
  } catch (err) {
    throw new Error(`${label}: ${err.message}`);
  }
}

async function fetchBucket(period, language) {
  const url = `${TRENDS_URL}?period=${encodeURIComponent(period)}&language=${encodeURIComponent(language)}`;
  const body = await fetchJson(url, `${period}/${language}`);
  return expectRows(body, `${period}/${language}`);
}

async function fetchHotCollections() {
  const body = await fetchJson(HOT_COLLECTIONS_URL, "hot collections");
  return expectRows(body, "hot collections").map((row) => ({
    id: toNumber(row.id),
    name: String(row.name ?? ""),
    repos: toNumber(row.repos),
    repoId: toNumber(row.repo_id),
    repoName: String(row.repo_name ?? ""),
    repoCurrentPeriodRank: toNumber(row.repo_current_period_rank),
    repoPastPeriodRank: toNumber(row.repo_past_period_rank),
    repoRankChanges: toNumber(row.repo_rank_changes),
  }));
}

function parseCollectionId(raw) {
  const match = raw.match(/^id:\s*(\d+)\s*$/m);
  if (!match) return null;
  return toNumber(match[1]);
}

async function loadCollectionRefs() {
  const files = (await readdir(COLLECTIONS_ROOT))
    .filter((file) => file.endsWith(".yml"))
    .sort();

  const refs = [];
  for (const file of files) {
    const raw = await readFile(resolve(COLLECTIONS_ROOT, file), "utf8");
    const id = parseCollectionId(raw);
    if (id === null) {
      throw new Error(`collection file ${file}: missing id`);
    }
    refs.push({
      id,
      slug: file.slice(0, -4),
    });
  }
  return refs;
}

function normalizeRankingRow(row) {
  return {
    repoId: toNumber(row.repo_id),
    repoName: String(row.repo_name ?? ""),
    currentPeriodGrowth: toNumber(row.current_period_growth),
    pastPeriodGrowth: toNumber(row.past_period_growth),
    growthPop: toFloat(row.growth_pop),
    rankPop: toNumber(row.rank_pop),
    total: toNumber(row.total),
    currentPeriodRank: toNumber(row.current_period_rank),
    pastPeriodRank: toNumber(row.past_period_rank),
  };
}

async function fetchCollectionRanking(collectionId, metric) {
  const url = `https://api.ossinsight.io/v1/collections/${collectionId}/ranking_by_${metric}/?period=${encodeURIComponent(COLLECTION_RANKING_PERIOD)}`;
  const body = await fetchJson(url, `collection ${collectionId} ranking_by_${metric}`);
  return expectRows(body, `collection ${collectionId} ranking_by_${metric}`).map(
    normalizeRankingRow,
  );
}

async function main() {
  const fetchedAt = new Date().toISOString();
  let totalRows = 0;
  let hotCollections = [];
  let totalCollectionRankingRows = 0;

  if (fetchTrendBuckets) {
    const buckets = {};

    for (const period of PERIODS) {
      buckets[period] = {};
      for (const language of LANGUAGES) {
        const rows = await fetchBucket(period, language);
        buckets[period][language] = rows;
        totalRows += rows.length;
        console.log(`ok  ${period} / ${language} - ${rows.length} rows`);
        await sleep(TRENDS_PAUSE_MS);
      }
    }

    hotCollections = await fetchHotCollections();
    console.log(`ok  hot collections - ${hotCollections.length} rows`);

    const trendsPayload = {
      fetchedAt,
      buckets,
    };
    const hotCollectionsPayload = {
      fetchedAt,
      rows: hotCollections,
    };

    await mkdir(dirname(TRENDS_OUT), { recursive: true });
    await writeFile(
      TRENDS_OUT,
      JSON.stringify(trendsPayload, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      HOT_COLLECTIONS_OUT,
      JSON.stringify(hotCollectionsPayload, null, 2) + "\n",
      "utf8",
    );

    // Dual-write: also push to data-store so live readers see fresh data
    // without waiting for a deploy. Throws if Redis is configured but
    // unreachable — workflow goes red, operator notices.
    const trendsRedis = await writeDataStore("trending", trendsPayload);
    const hotRedis = await writeDataStore("hot-collections", hotCollectionsPayload);

    console.log(
      `wrote ${TRENDS_OUT} (${totalRows} rows across ${PERIODS.length * LANGUAGES.length} buckets) [redis: ${trendsRedis.source}]`,
    );
    console.log(
      `wrote ${HOT_COLLECTIONS_OUT} (${hotCollections.length} rows) [redis: ${hotRedis.source}]`,
    );
  }

  if (fetchCollectionRankings) {
    const collectionRefs = await loadCollectionRefs();
    const collectionRankings = {};

    for (const collection of collectionRefs) {
      const metrics = {};
      for (const metric of COLLECTION_RANKING_METRICS) {
        const rows = await fetchCollectionRanking(collection.id, metric);
        metrics[metric] = rows;
        totalCollectionRankingRows += rows.length;
        console.log(
          `ok  collection ${collection.id} (${collection.slug}) / ${metric} - ${rows.length} rows`,
        );
        await sleep(COLLECTIONS_PAUSE_MS);
      }
      collectionRankings[String(collection.id)] = metrics;
    }

    const collectionRankingsPayload = {
      fetchedAt,
      period: COLLECTION_RANKING_PERIOD,
      collections: collectionRankings,
    };

    await mkdir(dirname(TRENDS_OUT), { recursive: true });
    await writeFile(
      COLLECTION_RANKINGS_OUT,
      JSON.stringify(collectionRankingsPayload, null, 2) + "\n",
      "utf8",
    );

    const rankingsRedis = await writeDataStore(
      "collection-rankings",
      collectionRankingsPayload,
    );

    console.log(
      `wrote ${COLLECTION_RANKINGS_OUT} (${totalCollectionRankingRows} rows across ${collectionRefs.length} collections x ${COLLECTION_RANKING_METRICS.length} metrics) [redis: ${rankingsRedis.source}]`,
    );
  }
}

main().catch((err) => {
  console.error("scrape-trending failed:", err.message ?? err);
  process.exit(1);
});
