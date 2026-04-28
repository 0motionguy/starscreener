#!/usr/bin/env node
// Enrich the latest arxiv-recent payload with citation + social-mention
// signals. Reads the raw papers (Redis preferred, file mirror fallback),
// pulls citation counts from Semantic Scholar, counts arxiv-id mentions
// across HN + Reddit (the two reliably-shaped mention readers we already
// commit), and writes a small enrichment payload back to the data-store
// under `arxiv-enriched`.
//
// The trending-side reader (src/lib/arxiv.ts) overlays this enrichment
// onto each paper before it hits the scorer, lighting up citationVelocity,
// citationCount and socialMentions components. Without this script the
// scorer falls back to coldStartBoost-only — which is the MVP behavior
// documented in arxiv.ts.
//
// CADENCE
//   .github/workflows/enrich-arxiv.yml runs every 6h at :13.
//   arXiv announces ~once daily; Semantic Scholar updates citation counts
//   continuously but slowly. 6h is plenty.
//
// RATE LIMITS
//   Semantic Scholar free tier: 5000 req per 5 min shared across the planet.
//   We pace at ~1 req/s and cap at top 200 papers/run. With a 24h cache
//   that prunes already-enriched papers, steady state is <100 fetches/run.
//
// RESILIENCE
//   - 429 / 5xx: respect Retry-After (parseRetryAfterMs from _fetch-json.mjs),
//     exponential backoff, max 3 attempts per paper.
//   - Persistent failure on a paper: keep its prior enrichment (if any),
//     log a warning, continue.
//   - Whole pipeline never throws; on Redis miss + missing file we log
//     "no input — skipping" and exit 0.
//
// SOCIAL MENTIONS
//   Plan asked for HN + Reddit + Bluesky + dev.to. MVP implements HN +
//   Reddit only — those two have the cleanest committed shapes and
//   together cover the bulk of arxiv-id chatter we'd see for tracked
//   repos. Bluesky and dev.to are deferred to a follow-up; their
//   readers are documented in the references below if a future agent
//   wants to wire them in (the contract here is just `socialMentions:
//   number`).
//
// REFERENCES
//   src/lib/hackernews-trending.ts, data/hackernews-trending.json
//   src/lib/reddit-data.ts, data/reddit-all-posts.json + reddit-mentions.json
//   src/lib/arxiv.ts (the consumer of this script's output)

import { readFileSync } from "node:fs";
import { writeFile as writeFileAsync, mkdir as mkdirAsync } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchWithTimeout,
  sleep,
  parseRetryAfterMs,
} from "./_fetch-json.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const ARXIV_RECENT_PATH = resolve(DATA_DIR, "arxiv-recent.json");
const HN_TRENDING_PATH = resolve(DATA_DIR, "hackernews-trending.json");
const REDDIT_ALL_POSTS_PATH = resolve(DATA_DIR, "reddit-all-posts.json");
const ENRICHED_PATH = resolve(DATA_DIR, "arxiv-enriched.json");

// Top-N cap on per-run enrichment fan-out. arxiv-recent ships 100 papers,
// so 200 is generous headroom while still bounding the API budget.
const TOP_N = 200;

// Skip papers whose lastEnrichedAt is fresher than this. Citation counts
// move slowly; 24h covers daily Semantic Scholar refresh windows.
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Window for counting social mentions. Mirrors the 7d windowing the rest
// of the trending pipeline uses.
const MENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Pace ~1 req/s — courteous to Semantic Scholar's free tier.
const REQ_INTERVAL_MS = 1_000;

const SEMANTIC_SCHOLAR_BASE =
  "https://api.semanticscholar.org/graph/v1/paper/arXiv:";
const SEMANTIC_SCHOLAR_FIELDS =
  "citationCount,influentialCitationCount,publicationDate";

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[enrich-arxiv] ${msg}`);
}

function warn(msg) {
  console.warn(`[enrich-arxiv] WARN: ${msg}`);
}

// ---------------------------------------------------------------------------
// Input loaders — Redis tier first, file fallback second.
// ---------------------------------------------------------------------------

/**
 * Tries to read the data-store value for `slug` via the same client used
 * by writeDataStore (ioredis if REDIS_URL set, Upstash REST if Upstash
 * creds set). Falls back to reading the file mirror at `data/<slug>.json`
 * when Redis is empty / absent / errors. Always returns an object with
 * `data` (parsed JSON or null) and `source` (string for the log).
 */
async function readDataStoreOrFile(slug, filePath) {
  // Try Redis via the same env wiring as writeDataStore. We open a
  // throwaway client just for these reads — the script is a single-shot
  // job and process exit drops the connection cleanly.
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    try {
      const { default: IORedis } = await import("ioredis");
      const client = new IORedis(redisUrl, {
        maxRetriesPerRequest: 3,
        connectTimeout: 5_000,
      });
      client.on("error", () => {});
      try {
        const raw = await client.get(`ss:data:v1:${slug}`);
        if (raw) {
          await client.quit().catch(() => {});
          return { data: JSON.parse(raw), source: "redis" };
        }
        await client.quit().catch(() => {});
      } catch (err) {
        warn(`redis read failed for ${slug}: ${err.message ?? err}`);
        await client.quit().catch(() => {});
      }
    } catch (err) {
      warn(`ioredis import failed: ${err.message ?? err}`);
    }
  } else if (upstashUrl && upstashToken) {
    try {
      const { Redis } = await import("@upstash/redis");
      const client = new Redis({ url: upstashUrl, token: upstashToken });
      const raw = await client.get(`ss:data:v1:${slug}`);
      if (raw) {
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        return { data, source: "redis" };
      }
    } catch (err) {
      warn(`upstash read failed for ${slug}: ${err.message ?? err}`);
    }
  }

  // File mirror fallback.
  try {
    const raw = readFileSync(filePath, "utf8");
    return { data: JSON.parse(raw), source: "file" };
  } catch {
    return { data: null, source: "missing" };
  }
}

// ---------------------------------------------------------------------------
// Semantic Scholar fetch with retry-after honoring backoff.
// ---------------------------------------------------------------------------

/**
 * Fetch citation metadata for a single arXiv ID.
 * Returns `{ citationCount, publicationDate }` on success, or `null` on
 * persistent failure (after retry budget exhausted). Never throws.
 */
async function fetchSemanticScholar(arxivId, attempts = 3) {
  const url = `${SEMANTIC_SCHOLAR_BASE}${encodeURIComponent(arxivId)}?fields=${SEMANTIC_SCHOLAR_FIELDS}`;
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res;
    try {
      res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        timeoutMs: 15_000,
      });
    } catch (err) {
      // Network error — retry up to budget.
      if (attempt === attempts) {
        warn(`semscholar network error for ${arxivId}: ${err.message ?? err}`);
        return null;
      }
      await sleep(1_000 * attempt);
      continue;
    }

    if (res.ok) {
      try {
        const json = await res.json();
        return {
          citationCount:
            typeof json?.citationCount === "number" ? json.citationCount : 0,
          publicationDate:
            typeof json?.publicationDate === "string"
              ? json.publicationDate
              : null,
        };
      } catch (err) {
        warn(`semscholar JSON parse for ${arxivId}: ${err.message ?? err}`);
        return null;
      }
    }

    // 404 = paper unknown to Semantic Scholar (common for very fresh
    // preprints — they index daily). Don't burn retries; treat as zero.
    if (res.status === 404) {
      return { citationCount: 0, publicationDate: null };
    }

    if (!RETRY_STATUSES.has(res.status) || attempt === attempts) {
      warn(`semscholar HTTP ${res.status} for ${arxivId} — giving up`);
      return null;
    }

    const retryMs =
      parseRetryAfterMs(res.headers.get("retry-after")) ?? 1_000 * attempt * 2;
    await sleep(retryMs);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Social mention counters — HN + Reddit only (MVP scope cut).
// ---------------------------------------------------------------------------

const ARXIV_URL_RE = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,6}(?:v[0-9]+)?)/gi;
const ARXIV_BARE_RE = /\b([0-9]{4}\.[0-9]{4,6})(v[0-9]+)?\b/g;

/**
 * Pull every arxiv-id-looking token out of free text. Strips the version
 * suffix so "2401.12345v2" and "2401.12345" both match the canonical id
 * we joined on. Tolerant of either bare ids or arxiv.org URLs.
 */
function extractArxivIds(text) {
  if (!text || typeof text !== "string") return [];
  const ids = new Set();
  let m;
  ARXIV_URL_RE.lastIndex = 0;
  while ((m = ARXIV_URL_RE.exec(text)) !== null) {
    ids.add(m[1].replace(/v[0-9]+$/, ""));
  }
  ARXIV_BARE_RE.lastIndex = 0;
  while ((m = ARXIV_BARE_RE.exec(text)) !== null) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

/**
 * Build a Map<arxivId, mentionCount> from a list of HN stories. Each
 * story counts at most once per id (avoids inflation when an id appears
 * in both title and storyText). Honors the MENTION_WINDOW_MS cutoff.
 */
function buildHnMentions(stories, nowMs) {
  const counts = new Map();
  if (!Array.isArray(stories)) return counts;
  const cutoffSec = (nowMs - MENTION_WINDOW_MS) / 1000;
  for (const s of stories) {
    if (typeof s?.createdUtc === "number" && s.createdUtc < cutoffSec) continue;
    const blob = `${s?.title ?? ""}\n${s?.url ?? ""}\n${s?.storyText ?? ""}`;
    for (const id of extractArxivIds(blob)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Same shape for Reddit — reddit-all-posts.json holds posts under
 * `topPosts`/`allPosts` (keyed differently per scraper version). We
 * accept both shapes plus a flat array.
 */
function buildRedditMentions(redditFile, nowMs) {
  const counts = new Map();
  const posts = pickRedditPosts(redditFile);
  const cutoffSec = (nowMs - MENTION_WINDOW_MS) / 1000;
  for (const p of posts) {
    if (typeof p?.createdUtc === "number" && p.createdUtc < cutoffSec) continue;
    const blob = `${p?.title ?? ""}\n${p?.url ?? ""}\n${p?.permalink ?? ""}`;
    for (const id of extractArxivIds(blob)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function pickRedditPosts(file) {
  if (!file) return [];
  if (Array.isArray(file)) return file;
  if (Array.isArray(file.allPosts)) return file.allPosts;
  if (Array.isArray(file.topPosts)) return file.topPosts;
  if (Array.isArray(file.posts)) return file.posts;
  // reddit-mentions.json shape: mentions is keyed by repo, each value
  // has stories[]. We don't recurse there — we use reddit-all-posts.json
  // as the primary mention surface (covers the broad scrape).
  return [];
}

// ---------------------------------------------------------------------------
// Velocity computation: citations per 30d window.
// ---------------------------------------------------------------------------

function computeCitationVelocity(citationCount, publicationDate, fallbackPublishedAt) {
  if (!citationCount || citationCount <= 0) return 0;
  const isoDate = publicationDate ?? fallbackPublishedAt;
  if (!isoDate) return 0;
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return 0;
  const days = Math.max(1, (Date.now() - t) / 86_400_000);
  // citations per 30d window. Floor at 30d so a paper from yesterday
  // with 1 citation isn't credited as 30 cit/30d.
  const windows = Math.max(days / 30, 1);
  return citationCount / windows;
}

// ---------------------------------------------------------------------------
// Main pipeline.
// ---------------------------------------------------------------------------

async function main() {
  const fetchedAt = new Date().toISOString();
  const nowMs = Date.now();

  // ---- Load arxiv-recent --------------------------------------------------
  const recent = await readDataStoreOrFile(
    "arxiv-recent",
    ARXIV_RECENT_PATH,
  );
  if (!recent.data || !Array.isArray(recent.data.papers)) {
    log("no arxiv-recent input — skipping (Redis empty + no file mirror)");
    return;
  }
  log(
    `loaded arxiv-recent: ${recent.data.papers.length} papers (source: ${recent.source})`,
  );

  // ---- Load prior enrichment for cache pruning ----------------------------
  const prior = await readDataStoreOrFile(
    "arxiv-enriched",
    ENRICHED_PATH,
  );
  const priorByArxivId = new Map();
  if (prior.data && Array.isArray(prior.data.papers)) {
    for (const p of prior.data.papers) {
      if (p?.arxivId) priorByArxivId.set(p.arxivId, p);
    }
    log(`prior enrichment: ${priorByArxivId.size} papers (source: ${prior.source})`);
  }

  // ---- Load social-mention sources ----------------------------------------
  const hn = await readDataStoreOrFile(
    "hackernews-trending",
    HN_TRENDING_PATH,
  );
  const reddit = await readDataStoreOrFile(
    "reddit-all-posts",
    REDDIT_ALL_POSTS_PATH,
  );
  const hnMentions = buildHnMentions(hn.data?.stories ?? [], nowMs);
  const redditMentions = buildRedditMentions(reddit.data, nowMs);
  log(
    `social mentions indexed: hn=${hnMentions.size} reddit=${redditMentions.size}`,
  );

  // ---- Decide which papers need a fresh Semantic Scholar fetch ------------
  const candidates = recent.data.papers.slice(0, TOP_N);
  const toFetch = [];
  const skipFresh = [];
  for (const p of candidates) {
    const cached = priorByArxivId.get(p.arxivId);
    if (cached) {
      const lastMs = Date.parse(cached.lastEnrichedAt ?? "");
      if (Number.isFinite(lastMs) && nowMs - lastMs < CACHE_MAX_AGE_MS) {
        skipFresh.push({ paper: p, cached });
        continue;
      }
    }
    toFetch.push(p);
  }
  log(`enrichment plan: fetch=${toFetch.length} cached=${skipFresh.length}`);

  // ---- Fetch Semantic Scholar paced 1/sec ---------------------------------
  const enriched = [];
  // Re-emit cached papers first (their citation data is still valid).
  for (const { paper, cached } of skipFresh) {
    const arxivId = paper.arxivId;
    const social =
      (hnMentions.get(arxivId) ?? 0) + (redditMentions.get(arxivId) ?? 0);
    enriched.push({
      arxivId,
      citationCount: cached.citationCount ?? 0,
      citationVelocity: cached.citationVelocity ?? 0,
      socialMentions: social,
      lastEnrichedAt: cached.lastEnrichedAt ?? fetchedAt,
    });
  }

  let lastTickMs = 0;
  for (const paper of toFetch) {
    // Pace requests at REQ_INTERVAL_MS apart.
    const elapsed = Date.now() - lastTickMs;
    if (elapsed < REQ_INTERVAL_MS) await sleep(REQ_INTERVAL_MS - elapsed);
    lastTickMs = Date.now();

    const result = await fetchSemanticScholar(paper.arxivId);
    let citationCount = 0;
    let citationVelocity = 0;
    if (result) {
      citationCount = result.citationCount ?? 0;
      citationVelocity = computeCitationVelocity(
        citationCount,
        result.publicationDate,
        paper.publishedAt,
      );
    } else {
      // Persistent failure: keep the prior record if we have one, else zero.
      const cached = priorByArxivId.get(paper.arxivId);
      if (cached) {
        citationCount = cached.citationCount ?? 0;
        citationVelocity = cached.citationVelocity ?? 0;
      }
    }
    const social =
      (hnMentions.get(paper.arxivId) ?? 0) +
      (redditMentions.get(paper.arxivId) ?? 0);
    enriched.push({
      arxivId: paper.arxivId,
      citationCount,
      citationVelocity,
      socialMentions: social,
      lastEnrichedAt: result ? fetchedAt : (priorByArxivId.get(paper.arxivId)?.lastEnrichedAt ?? fetchedAt),
    });
  }

  const payload = {
    fetchedAt,
    source: "api.semanticscholar.org/graph/v1/paper/arXiv:* + HN + Reddit",
    socialSources: ["hackernews", "reddit"],
    count: enriched.length,
    papers: enriched,
  };

  await mkdirAsync(DATA_DIR, { recursive: true });
  await writeFileAsync(ENRICHED_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redis = await writeDataStore("arxiv-enriched", payload);

  log(`wrote ${ENRICHED_PATH} [redis: ${redis.source}]`);
  log(
    `  ${enriched.length} papers enriched (${toFetch.length} fresh fetches, ${skipFresh.length} cached)`,
  );
  const withCit = enriched.filter((p) => p.citationCount > 0).length;
  const withSocial = enriched.filter((p) => p.socialMentions > 0).length;
  log(`  ${withCit} have citations; ${withSocial} have social mentions`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  main().catch((err) => {
    console.error("enrich-arxiv failed:", err.message ?? err);
    process.exit(1);
  });
}

export {
  extractArxivIds,
  buildHnMentions,
  buildRedditMentions,
  computeCitationVelocity,
};
