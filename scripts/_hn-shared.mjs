// Shared helpers for the HackerNews scraper.
//
// Two upstream APIs:
//   1. Firebase  — https://hacker-news.firebaseio.com/v0  (per-item GET,
//      no rate limit documented but we throttle to 5 req/sec to be polite)
//   2. Algolia   — https://hn.algolia.com/api/v1          (search + filter,
//      ~10000 req/hr free tier — we use ~5 calls per run)
//
// Both endpoints are public, no auth, no app registration.
// The User-Agent is descriptive so HN ops can identify us if there's
// ever an abuse concern. No browser-default UAs.

export const USER_AGENT =
  "StarScreener/0.1 (+https://github.com/0motionguy/starscreener; local-dev-scrape)";

// Window-batch concurrency: 5 parallel in-flight requests, then a pause.
// Effective rate: batch_size / (avg_latency + pause). With typical 100-200ms
// Firebase latency + 200ms pause, this works out to ~10-15 req/sec — not
// 5/sec as the old comment claimed. HN has no published rate limit on the
// Firebase endpoint, and we burn <120s per 500-item run, so the headroom
// is irrelevant in practice. See Sprint 1 finding #5.
export const FIREBASE_PAUSE_MS = 200;
export const FIREBASE_BATCH_SIZE = 5;
// Algolia is generous; 1s between paginated calls is conservative.
export const ALGOLIA_PAUSE_MS = 1000;

// Per-request timeout — without this a single hung fetch would wedge the
// whole batch. 10s covers normal Firebase latency by >10×. Finding #5.
const FETCH_TIMEOUT_MS = 10_000;
// Retries for 5xx / network errors. HN's infra has occasional 502 spikes
// during traffic peaks; a single retry after a backoff clears almost all
// of them without a full re-run.
const FETCH_MAX_ATTEMPTS = 3;
const RETRY_STATUSES = new Set([500, 502, 503, 504]);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIREBASE_BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err) {
      lastErr = err;
      clearTimeout(timer);
      if (attempt < FETCH_MAX_ATTEMPTS) {
        await sleep(300 * attempt);
        continue;
      }
      throw err;
    }
    clearTimeout(timer);
    if (!res.ok) {
      if (RETRY_STATUSES.has(res.status) && attempt < FETCH_MAX_ATTEMPTS) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(500 * attempt);
        continue;
      }
      const err = new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  throw lastErr ?? new Error(`fetchJson: unknown failure — ${url}`);
}

export async function fetchTopStoryIds() {
  // Returns up to 500 IDs of the current top stories on HN, ordered
  // best-to-worst by HN's own ranking (frontpage state at fetch time).
  const ids = await fetchJson(`${FIREBASE_BASE}/topstories.json`);
  if (!Array.isArray(ids)) {
    throw new Error("topstories.json: expected array");
  }
  return ids.filter((n) => Number.isInteger(n) && n > 0);
}

export async function fetchItem(id) {
  // Returns the raw HN item object or null when the item is dead/deleted
  // (Firebase returns `null` for missing items — not a 404).
  const item = await fetchJson(`${FIREBASE_BASE}/item/${id}.json`);
  return item ?? null;
}

/**
 * Fetch every item ID in `ids` with bounded concurrency. Pauses
 * `FIREBASE_PAUSE_MS` between batches of `FIREBASE_BATCH_SIZE`. Items
 * that fail their fetch (network/HTTP/dead) are skipped and counted in
 * the returned `errors` count — never throws unless every fetch fails.
 */
export async function fetchItemsBatched(ids, { onProgress } = {}) {
  const results = [];
  let errors = 0;
  for (let i = 0; i < ids.length; i += FIREBASE_BATCH_SIZE) {
    const batch = ids.slice(i, i + FIREBASE_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((id) => fetchItem(id)));
    for (let j = 0; j < settled.length; j += 1) {
      const r = settled[j];
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
      } else if (r.status === "rejected") {
        errors += 1;
      }
    }
    if (typeof onProgress === "function") {
      onProgress({ done: Math.min(i + FIREBASE_BATCH_SIZE, ids.length), total: ids.length, errors });
    }
    if (i + FIREBASE_BATCH_SIZE < ids.length) {
      await sleep(FIREBASE_PAUSE_MS);
    }
  }
  return { items: results, errors };
}

/**
 * Search Algolia for stories matching `query`, optionally constrained to
 * a `since` UNIX timestamp (created_at_i > since). Returns ALL matching
 * hits across pages. `hitsPerPage=100` (Algolia max for free tier).
 */
export async function searchAlgoliaStories({ query, since }) {
  const hitsPerPage = 100;
  const numericFilters = since ? `&numericFilters=created_at_i>${since}` : "";
  const all = [];
  let page = 0;
  let nbPages = 1;
  while (page < nbPages) {
    const url =
      `${ALGOLIA_BASE}/search?query=${encodeURIComponent(query)}` +
      `&tags=story&hitsPerPage=${hitsPerPage}&page=${page}${numericFilters}`;
    const body = await fetchJson(url);
    if (!body || !Array.isArray(body.hits)) {
      throw new Error(`Algolia search: malformed response on page ${page}`);
    }
    for (const hit of body.hits) all.push(hit);
    nbPages = Number.isFinite(body.nbPages) ? body.nbPages : page + 1;
    page += 1;
    if (page < nbPages) await sleep(ALGOLIA_PAUSE_MS);
    // Algolia's free tier paginates up to ~50 pages anyway; cap defensively.
    if (page >= 20) break;
  }
  return all;
}
