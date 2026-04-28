// Shared helpers for the Bluesky (AT Protocol) scraper.
//
// Endpoint: https://bsky.social/xrpc/
// Auth:     app-password → com.atproto.server.createSession → accessJwt
// Search:   app.bsky.feed.searchPosts (authenticated)
//
// Access JWT lives ~2h. For hourly cron we mint a fresh session each run
// and never persist refreshJwt — simpler than refresh-token bookkeeping.
//
// Zero npm deps: pure fetch + URLSearchParams.

import { fetchWithTimeout } from "./_fetch-json.mjs";

export const USER_AGENT =
  "TrendingRepo/0.2 (+https://github.com/0motionguy/starscreener; bluesky-scraper)";

const AT_PDS = "https://bsky.social";
const SEARCH_THROTTLE_MS = 250;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Thrown when the AT Protocol returns HTTP 429. The caller should log the
 * reset window + exit the current keyword/pagination loop without blowing
 * up the whole run — we want previous committed JSON to remain valid when
 * one search bucket runs over.
 */
export class BlueskyRateLimitError extends Error {
  constructor(message, rateLimit) {
    super(message);
    this.name = "BlueskyRateLimitError";
    this.rateLimit = rateLimit;
  }
}

async function readSafe(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function readRateLimit(res) {
  return {
    limit: res.headers.get("ratelimit-limit"),
    remaining: res.headers.get("ratelimit-remaining"),
    reset: res.headers.get("ratelimit-reset"),
    policy: res.headers.get("ratelimit-policy"),
  };
}

/**
 * Authenticate with AT Protocol using an app password. Returns the full
 * session payload: `{ accessJwt, refreshJwt, did, handle, email?, ... }`.
 * Throws on any non-2xx — GHA should fail the run so we don't overwrite
 * yesterday's good data with a half-scrape.
 */
export async function createSession(identifier, password) {
  const res = await fetchWithTimeout(`${AT_PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
    body: JSON.stringify({ identifier, password }),
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    const body = await readSafe(res);
    throw new Error(
      `createSession ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
    );
  }
  return res.json();
}

/**
 * One page of `app.bsky.feed.searchPosts`. Returns the raw posts array,
 * the next-page cursor (or null), and the rate-limit headers for logging.
 *
 * sort: "latest" for firehose-ordered recency; "top" for engagement-ranked.
 * limit: 1..100 (AT Proto max).
 */
export async function searchPostsPage({
  accessJwt,
  q,
  sort = "latest",
  limit = 100,
  cursor,
}) {
  const params = new URLSearchParams({
    q,
    sort,
    limit: String(limit),
  });
  if (cursor) params.set("cursor", cursor);
  const res = await fetchWithTimeout(
    `${AT_PDS}/xrpc/app.bsky.feed.searchPosts?${params}`,
    {
      headers: {
        authorization: `Bearer ${accessJwt}`,
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
      timeoutMs: 15_000,
    },
  );
  const rateLimit = readRateLimit(res);
  if (res.status === 429) {
    throw new BlueskyRateLimitError(
      `rate-limited: reset=${rateLimit.reset ?? "?"} remaining=${rateLimit.remaining ?? "?"}`,
      rateLimit,
    );
  }
  if (!res.ok) {
    const body = await readSafe(res);
    throw new Error(
      `searchPosts ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
    );
  }
  const body = await res.json();
  return {
    posts: Array.isArray(body?.posts) ? body.posts : [],
    cursor: body?.cursor ?? null,
    rateLimit,
  };
}

/**
 * Paginated searchPosts up to `maxPages`. Respects AT Proto's own cursor
 * signalling (null cursor = no more pages) AND bails early when a page
 * returns fewer items than requested (a cheap heuristic to stop one page
 * short of hammering the empty-results page).
 */
export async function searchPostsAllPages({
  accessJwt,
  q,
  sort = "latest",
  limit = 100,
  maxPages = 1,
}) {
  const all = [];
  let cursor;
  let pagesFetched = 0;
  let lastRateLimit;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await searchPostsPage({ accessJwt, q, sort, limit, cursor });
    pagesFetched += 1;
    lastRateLimit = res.rateLimit;
    for (const p of res.posts) all.push(p);
    if (!res.cursor || res.posts.length < limit) break;
    cursor = res.cursor;
    if (page + 1 < maxPages) await sleep(SEARCH_THROTTLE_MS);
  }
  return { posts: all, pagesFetched, lastRateLimit };
}

/**
 * Turn an at:// URI into a canonical bsky.app post URL.
 *
 * Input:  at://did:plc:sxnptipmxyos4tabdubj2pzr/app.bsky.feed.post/3kxyz
 * Output: https://bsky.app/profile/<handle>/post/3kxyz
 *
 * bsky.app accepts either the DID or the handle in the profile slot; we
 * prefer the handle because it's human-readable and stable across
 * deployment-time author renames (bsky.app redirects DID → handle).
 */
export function deriveBskyUrl(uri, handleOrDid) {
  const parts = String(uri ?? "").split("/");
  const rkey = parts[parts.length - 1] ?? "";
  const profile = String(handleOrDid ?? "").trim() || "unknown";
  return `https://bsky.app/profile/${encodeURIComponent(profile)}/post/${encodeURIComponent(rkey)}`;
}

/**
 * Collect external URLs from an AT Proto post's embed tree.
 *
 * Shapes we handle:
 *   - app.bsky.embed.external#view        → embed.external.uri
 *   - app.bsky.embed.recordWithMedia#view → embed.media.external.uri
 *
 * We skip deep walks of quoted-record embeds; the host post's text + any
 * facet-link features already cover github.com mentions written in-line.
 */
export function extractUrlsFromEmbed(embed) {
  const urls = [];
  if (!embed || typeof embed !== "object") return urls;
  if (embed.external && typeof embed.external.uri === "string") {
    urls.push(embed.external.uri);
  }
  if (embed.media && embed.media.external && typeof embed.media.external.uri === "string") {
    urls.push(embed.media.external.uri);
  }
  return urls;
}

/**
 * Collect link URIs from a post's richtext facets. These are the
 * "linkified" spans Bluesky renders as blue underlined text — useful
 * because some posts embed github.com via facet with display text that
 * doesn't contain "github.com" literally.
 */
export function extractUrlsFromFacets(facets) {
  const urls = [];
  if (!Array.isArray(facets)) return urls;
  for (const f of facets) {
    const feats = Array.isArray(f?.features) ? f.features : [];
    for (const feat of feats) {
      if (feat?.$type === "app.bsky.richtext.facet#link" && typeof feat.uri === "string") {
        urls.push(feat.uri);
      }
    }
  }
  return urls;
}

/**
 * Flatten every URL referenced by a single searchPosts result — text
 * mentions, embed.external, embed.media.external, facet links.
 */
export function collectPostUrls(post) {
  const urls = [];
  const embedUrls = extractUrlsFromEmbed(post?.embed);
  const facetUrls = extractUrlsFromFacets(post?.record?.facets);
  for (const u of embedUrls) urls.push(u);
  for (const u of facetUrls) urls.push(u);
  return urls;
}
