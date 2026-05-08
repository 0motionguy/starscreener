// Apify Reddit provider — runs trudax/reddit-scraper-lite (or an operator-
// configured actor) and maps the structured result into the same
// `{ id, title, score, num_comments, created_utc, ... }` shape that
// scrape-reddit.mjs:fetchSubredditNew already returns from the public-JSON /
// OAuth path. This drops in via an env-gated branch — the rest of the
// scrape pipeline (classify → score → mergeAllPosts → writeDataStore) is
// untouched.
//
// Why: Reddit's anti-bot blocks data-center IPs (GH Actions runners, Vercel
// build IPs, Vultr DCs all 403 on /r/X/new.json and the web UI). The unauth
// path falls through to RSS-Atom which doesn't expose `score` or
// `num_comments` — so 4,500 posts arrive with zero engagement and the
// trending sort collapses. Apify's residential-proxy fleet bypasses the IP
// block AND returns the engagement fields we need. Same trick the Twitter
// collector uses.
//
// Usage:
//   REDDIT_COLLECTOR_PROVIDER=apify
//   APIFY_API_TOKEN=<token>                          // required
//   APIFY_REDDIT_ACTOR=trudax~reddit-scraper-lite    // optional override
//
// Budget: each call to fetchSubredditViaApify(sub) issues ONE actor run for
// ONE subreddit. trudax/reddit-scraper-lite is pay-per-result (~$1.50/1k);
// 45 subs × 100 posts = 4,500 posts ≈ $6.75/run. Cron at 4×/day → ~$27/day.
// To cut cost, drop POSTS_PER_SUB to 50 in scrape-reddit.mjs (matches the
// keep-last-50 invariant) → ~$13/day.

const DEFAULT_ACTOR = "trudax~reddit-scraper-lite";
const API_BASE = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 180_000; // 3 min — Reddit listing scrapes are
                                    // slower than Twitter searches because
                                    // the actor scrolls multi-page listings.

let providerStats = createProviderStats();

function createProviderStats() {
  return {
    requests: 0,
    errors: 0,
    lastError: null,
    actor: null,
  };
}

export function getApifyRedditProviderStats() {
  return { ...providerStats };
}

export function resetApifyRedditProviderStats() {
  providerStats = createProviderStats();
}

function readToken() {
  // GitHub Actions `${{ vars.FOO }}` substitutes an empty string when the
  // var is unset, not undefined — so `??` falls through incorrectly. Treat
  // empty/whitespace as missing. Same trap the Twitter provider documents.
  const raw = process.env.APIFY_API_TOKEN ?? "";
  const token = raw.trim();
  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN unset — set it as a repo secret to enable the Apify Reddit provider",
    );
  }
  return token;
}

function readActor() {
  const raw = process.env.APIFY_REDDIT_ACTOR ?? "";
  const actor = raw.trim();
  return actor || DEFAULT_ACTOR;
}

/**
 * Fetch the latest N posts from a subreddit via Apify, returning the same
 * shape that scrape-reddit.mjs:fetchSubredditNew expects (an array of post
 * objects matching the public-JSON `data.children[].data` shape).
 *
 * Caller passes the bare sub name (e.g. "ClaudeAI"). We construct the
 * listing URL the actor scrapes.
 *
 * @param {string} sub
 * @param {{ limit?: number, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function fetchSubredditViaApify(sub, opts = {}) {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 1000);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const token = readToken();
  const actor = readActor();
  providerStats.actor = actor;

  // trudax/reddit-scraper-lite input schema (stable across the actor's
  // public versions). Residential proxy is essential — datacenter IPs 429
  // on Reddit aggressively in 2026. skipComments/skipUserPosts/skipCommunity
  // narrow the scrape to listing-only output (we don't need comment trees
  // or user pages, just /r/<sub>/new posts).
  const input = {
    startUrls: [{ url: `https://www.reddit.com/r/${sub}/new/` }],
    sort: "new",
    maxItems: limit,
    maxPostCount: limit,
    skipComments: true,
    skipUserPosts: true,
    skipCommunity: true,
    proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    // scrollTimeout: how long the actor scrolls /new before stopping.
    // Reddit shows ~25 posts per page; for 100 posts we need ~4 scrolls.
    // 60s is comfortable headroom, well under our 180s wall timeout.
    scrollTimeout: 60,
  };

  const url = `${API_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  providerStats.requests += 1;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      providerStats.errors += 1;
      const text = await res.text().catch(() => "");
      const msg = `apify actor ${actor} HTTP ${res.status}: ${text.slice(0, 200)}`;
      providerStats.lastError = msg;
      throw new Error(msg);
    }
    const body = await res.json().catch(() => []);
    if (!Array.isArray(body)) return [];
    const out = [];
    for (const raw of body) {
      const post = mapApifyPostToRedditShape(raw, sub);
      if (post) out.push(post);
    }
    return out;
  } catch (err) {
    providerStats.errors += 1;
    providerStats.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function str(v) {
  return typeof v === "string" ? v : null;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Map a single trudax/reddit-scraper-lite post object to the
 * public-JSON-compatible shape that scrape-reddit.mjs consumes.
 *
 * trudax fields (variable across actor versions — we read both spellings):
 *   id / parsedId               (t3_xxx or bare base36)
 *   title                       string
 *   body                        string (selftext)
 *   url / postUrl               link href
 *   numberOfVotes / upVotes     score
 *   numberOfComments            comment count
 *   createdAt                   ISO 8601 timestamp
 *   postedBy / username         author handle
 *   communityName / parsedCommunityName
 *   flair / flairText           link flair
 *   isSelf                      self-vs-link
 *
 * Required output fields (from scripts/scrape-reddit.mjs:820-911 + mergeAllPosts):
 *   id, title, url, permalink, selftext, score, num_comments,
 *   created_utc, author, subreddit, link_flair_text, is_self, _source
 *
 * @param {unknown} raw
 * @param {string} fallbackSub
 * @returns {object | null}
 */
export function mapApifyPostToRedditShape(raw, fallbackSub) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;

  // ID — trudax uses `parsedId` for the base36 id; some versions emit
  // `id: "t3_xxx"` instead. Strip the t3_ prefix so it matches the JSON-API
  // value (which is what the rest of the pipeline keys off of).
  let id = str(r.parsedId);
  if (!id) {
    const idRaw = str(r.id);
    if (idRaw) {
      const m = idRaw.match(/^t3_([a-z0-9]+)$/i);
      id = m ? m[1] : idRaw;
    }
  }
  if (!id) return null;

  const createdRaw = str(r.createdAt) ?? str(r.created_utc) ?? str(r.created);
  const createdMs = createdRaw ? Date.parse(createdRaw) : NaN;
  if (!Number.isFinite(createdMs)) return null;

  const title = (str(r.title) ?? "").trim();
  if (!title) return null;

  const url = str(r.postUrl) ?? str(r.url) ?? "";
  const permalink = url
    .replace(/^https?:\/\/(?:www|old)\.reddit\.com/, "")
    .replace(/\?.*$/, "")
    || `/r/${fallbackSub}/comments/${id}/`;

  const subreddit =
    str(r.parsedCommunityName) ??
    String(r.communityName ?? "").replace(/^r\//, "") ??
    fallbackSub;

  const author = String(
    str(r.postedBy) ?? str(r.username) ?? str(r.author) ?? "",
  )
    .replace(/^\/u\//, "")
    .replace(/^u\//, "");

  const score =
    num(r.numberOfVotes) ??
    num(r.upVotes) ??
    num(r.score) ??
    num(r.upvotes) ??
    0;

  const numComments =
    num(r.numberOfComments) ??
    num(r.num_comments) ??
    num(r.comments) ??
    0;

  const isSelf =
    typeof r.isSelf === "boolean"
      ? r.isSelf
      : !/^https?:\/\/(?!.*reddit\.com)/.test(url);

  return {
    id,
    name: `t3_${id}`,
    title,
    author,
    subreddit: subreddit || fallbackSub,
    url,
    permalink,
    selftext: str(r.body) ?? "",
    is_self: isSelf,
    created_utc: Math.floor(createdMs / 1000),
    score,
    num_comments: numComments,
    link_flair_text: str(r.flair) ?? str(r.flairText) ?? null,
    _source: "apify-reddit",
  };
}
