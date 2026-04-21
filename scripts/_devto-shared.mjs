// Shared helpers for the dev.to scraper.
//
// Upstream API: https://dev.to/api  (public, no auth required for reads).
// Optional `api-key` header bumps rate limits — supplied via DEVTO_API_KEY.
//
// Endpoints used:
//   GET /articles?top={days}&per_page={n}              — top by reactions
//   GET /articles?tag={tag}&top={days}&per_page={n}    — tag-filtered
//   GET /articles/{id}                                  — full body_markdown
//
// Throttle: 5 req/sec sustained. dev.to documents ~30 req/sec ceiling,
// but staying conservative keeps us well clear of any per-IP soft limit.

export const USER_AGENT =
  "StarScreener/0.1 (+https://github.com/0motionguy/starscreener; daily-devto-scrape)";

export const DEVTO_BASE = "https://dev.to/api";
export const DEVTO_PAUSE_MS = 200; // 5 req/sec
export const DEVTO_BATCH_SIZE = 5; // 5 in-flight, then pause

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildHeaders() {
  const h = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  const key = process.env.DEVTO_API_KEY;
  if (key) h["api-key"] = key;
  return h;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * GET /articles with optional tag + top window. Returns the array as-is
 * (each article has summary fields + tag_list, but NOT body_markdown).
 */
export async function fetchArticleList({ tag, top = 7, perPage = 100 }) {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  params.set("top", String(top));
  params.set("per_page", String(perPage));
  const url = `${DEVTO_BASE}/articles?${params.toString()}`;
  const body = await fetchJson(url);
  if (!Array.isArray(body)) {
    throw new Error(`articles list: expected array (tag=${tag ?? "none"})`);
  }
  return body;
}

/**
 * GET /articles/{id} — full article incl. body_markdown.
 * Returns null on 404 (article unpublished/deleted between list + detail).
 */
export async function fetchArticleDetail(id) {
  try {
    return await fetchJson(`${DEVTO_BASE}/articles/${id}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Fetch full detail for every ID with bounded concurrency. Pauses
 * DEVTO_PAUSE_MS between batches of DEVTO_BATCH_SIZE. On the second
 * consecutive 429/5xx batch, the caller should switch to description-only
 * mode — we surface that signal by counting `consecutive5xxBatches` in
 * the result rather than aborting outright.
 */
export async function fetchDetailsBatched(ids, { onProgress } = {}) {
  const results = [];
  let errors = 0;
  let consecutiveBadBatches = 0;
  let aborted = false;

  for (let i = 0; i < ids.length; i += DEVTO_BATCH_SIZE) {
    if (aborted) break;
    const batch = ids.slice(i, i + DEVTO_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((id) => fetchArticleDetail(id)));

    let batchHadFatal = false;
    for (let j = 0; j < settled.length; j += 1) {
      const r = settled[j];
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
      } else if (r.status === "rejected") {
        errors += 1;
        const status = r.reason?.status;
        if (status === 429 || (status >= 500 && status <= 599)) {
          batchHadFatal = true;
        }
      }
    }

    if (batchHadFatal) {
      consecutiveBadBatches += 1;
      if (consecutiveBadBatches >= 2) {
        aborted = true; // caller falls back to description-only matching
      }
    } else {
      consecutiveBadBatches = 0;
    }

    if (typeof onProgress === "function") {
      onProgress({
        done: Math.min(i + DEVTO_BATCH_SIZE, ids.length),
        total: ids.length,
        errors,
      });
    }
    if (i + DEVTO_BATCH_SIZE < ids.length && !aborted) {
      await sleep(DEVTO_PAUSE_MS);
    }
  }

  return { details: results, errors, aborted };
}
