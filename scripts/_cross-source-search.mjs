// Per-channel mention adapters for the cross-source mentions sweep.
//
// Each adapter takes a `RepoInput` (fullName, owner, name, packageNames,
// homepageUrl, aliases) and returns `Mention[]`, fail-soft. Errors are
// logged + return [] so the sweep continues across channels.
//
// Mention shape:
//   {
//     source:   "twitter" | "reddit" | "hackernews" | "bluesky" |
//               "devto" | "lobsters" | "producthunt" | "tavily",
//     fullName: "owner/name",                         // attribution
//     url:      string,                               // canonical link
//     title:    string,                               // headline-ish text
//     text:     string,                               // body excerpt (≤500ch)
//     author:   string | null,                        // who posted
//     engagement: { score?: number, comments?: number, reactions?: number },
//     observedAt: string                              // ISO timestamp
//   }
//
// All adapters use compact stand-alone HTTP calls — no shared session except
// where the upstream demands one (Bluesky AT proto JWT). Reuses existing
// fetch-with-retry + Algolia helpers where they fit; otherwise plain fetch
// with a 15s timeout to bound the sweep wall-clock.

import { searchAlgoliaStories } from "./_hn-shared.mjs";
import { getCachedTavily, setCachedTavily } from "./_tavily-cache.mjs";

const FETCH_TIMEOUT_MS = 15_000;
const TEXT_TRUNCATE = 500;

const UA =
  "TrendingRepo/0.2 (+https://github.com/0motionguy/starscreener; cross-source-sweep)";

// Per-channel kill switches. Set SWEEP_DISABLE_<CHANNEL>=1 to short-circuit
// an adapter without redeploying — useful when the Apify Twitter actor goes
// wonky, Reddit starts 429ing the world, or Tavily hits its budget.
function isChannelDisabled(channel) {
  return process.env[`SWEEP_DISABLE_${channel.toUpperCase()}`] === "1";
}

// Apify per-tweet cost map by actor handle prefix. Used by `searchTwitter`
// to log a $-cost line every run so we can track spend without checking
// the Apify console. Numbers are USD, sourced from actor pages 2026-05;
// re-verify before flipping defaults. Default $0.0005/tweet (conservative).
const COST_PER_TWEET = {
  "xquik~": 0.00015,
  "apidojo~tweet-scraper": 0.0004,
  "apidojo~twitter-scraper-lite": 0.0004,
  "get-leads~": 0.0002,
};
const DEFAULT_COST_PER_TWEET = 0.0005;

function costPerTweetFor(actorId) {
  for (const [prefix, cost] of Object.entries(COST_PER_TWEET)) {
    if (actorId.startsWith(prefix)) return cost;
  }
  return DEFAULT_COST_PER_TWEET;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(value, max = TEXT_TRUNCATE) {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(opts.headers ?? {}) },
      method: opts.method ?? "GET",
      body: opts.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${opts.method ?? "GET"} ${url} HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isoFromUnix(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function emptyResult(source, reason) {
  if (reason && process.env.SWEEP_VERBOSE) {
    console.warn(`[xs:${source}] skip: ${reason}`);
  }
  return [];
}

function logFailure(source, repo, err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[xs:${source}] ${repo.fullName}: ${message.slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// HackerNews — Algolia search-by-query, last 7d.
//
// Search strategy: 3 progressive queries to maximize recall.
//   1. URL match  — "github.com/owner/name" — catches Show HN / link posts
//   2. Slug match — "owner/name" loose       — catches discussion threads
//   3. Name match — "name" alone             — catches casual mentions
//                   (only when name is distinctive, ≥5 chars + not generic)
// Results deduped by objectID. Loose (unquoted) queries — Algolia's exact-
// phrase search misses too many casual mentions like "I'm using <name>".
// ---------------------------------------------------------------------------

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

const HN_GENERIC_NAMES = new Set([
  "skills", "core", "api", "cli", "agent", "agents", "bot", "framework",
  "code", "app", "apps", "sdk", "lib", "tools", "ui", "model", "models",
  "client", "server", "data", "docs", "engine", "kit", "plugin", "project",
  "service", "utils", "web", "playground", "demo", "starter", "template",
]);

function isDistinctiveName(name) {
  if (typeof name !== "string") return false;
  const lower = name.trim().toLowerCase();
  if (lower.length < 5) return false;
  if (HN_GENERIC_NAMES.has(lower)) return false;
  return true;
}

export async function searchHackerNews(repo) {
  if (isChannelDisabled("hackernews")) return emptyResult("hackernews", "disabled via env");
  const since = Math.floor(Date.now() / 1000) - SEVEN_DAYS_S;
  const seen = new Map(); // objectID → hit
  const queries = [
    `github.com/${repo.fullName}`,
    `${repo.owner}/${repo.name}`,
  ];
  if (isDistinctiveName(repo.name)) {
    queries.push(repo.name);
  }
  try {
    for (const query of queries) {
      const stories = await searchAlgoliaStories({ query, since });
      for (const s of stories ?? []) {
        if (!seen.has(s.objectID)) seen.set(s.objectID, s);
      }
    }
    return Array.from(seen.values()).map((s) => ({
      source: "hackernews",
      fullName: repo.fullName,
      url: s.url || `https://news.ycombinator.com/item?id=${s.objectID}`,
      title: truncate(s.title ?? "", 200),
      text: truncate(s.story_text ?? s.comment_text ?? "", TEXT_TRUNCATE),
      author: s.author ?? null,
      engagement: {
        score: s.points ?? 0,
        comments: s.num_comments ?? 0,
      },
      observedAt: isoFromUnix(s.created_at_i),
    }));
  } catch (err) {
    logFailure("hackernews", repo, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reddit — public search JSON, last 7d, sort=new.
//
// Search strategy: same progressive widening as HN — drop quotes for loose
// match, fall back to name-only when the name is distinctive. Reddit's
// full-text indexer is even noisier than Algolia, so we cap result count
// per query and dedup by post ID.
// ---------------------------------------------------------------------------

// Reddit fetcher that honors `Retry-After` on 429. One retry, capped at 30s.
// Returns `null` when both attempts fail or 429 — caller treats as "skip
// this query" and continues with the next.
async function fetchRedditWithBackoff(url, repo) {
  const headers = { "User-Agent": UA, Accept: "application/json" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (process.env.SWEEP_VERBOSE) {
        console.warn(`[xs:reddit] ${repo.fullName} fetch error: ${err instanceof Error ? err.message : err}`);
      }
      return null;
    }
    clearTimeout(timer);
    if (res.ok) {
      try {
        return await res.json();
      } catch (err) {
        if (process.env.SWEEP_VERBOSE) {
          console.warn(`[xs:reddit] ${repo.fullName} json parse: ${err instanceof Error ? err.message : err}`);
        }
        return null;
      }
    }
    if (res.status === 429 && attempt === 0) {
      // Parse Retry-After (seconds, per RFC). Cap at 30s; values that
      // can't be parsed default to 5s. Then retry once.
      const raw = res.headers.get("retry-after");
      const seconds = raw ? Number(raw) : NaN;
      const waitMs = Math.min(
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5_000,
        30_000,
      );
      console.warn(`[xs:reddit] ${repo.fullName} 429 — backing off ${waitMs}ms then retrying once`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (process.env.SWEEP_VERBOSE) {
      console.warn(`[xs:reddit] ${repo.fullName} HTTP ${res.status}`);
    }
    return null;
  }
  // Two 429s — give up on this query.
  return null;
}

export async function searchReddit(repo) {
  if (isChannelDisabled("reddit")) return emptyResult("reddit", "disabled via env");
  // Public Reddit JSON works without OAuth at low volume; a per-repo lookup
  // is well within the unauthenticated budget. OAuth is optional.
  const queries = [
    `github.com/${repo.fullName}`,
    `${repo.owner}/${repo.name}`,
  ];
  if (isDistinctiveName(repo.name)) {
    queries.push(repo.name);
  }
  const seen = new Map(); // post id → mention
  try {
    for (const q of queries) {
      const url = `https://old.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=week&limit=50`;
      const data = await fetchRedditWithBackoff(url, repo);
      if (!data) continue; // 429 / parse / network — skip query, keep going
      const children = data?.data?.children ?? [];
      for (const c of children) {
        const d = c.data ?? {};
        if (!d.id || seen.has(d.id)) continue;
        seen.set(d.id, {
          source: "reddit",
          fullName: repo.fullName,
          url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url ?? "",
          title: truncate(d.title ?? "", 200),
          text: truncate(d.selftext ?? "", TEXT_TRUNCATE),
          author: d.author ?? null,
          engagement: {
            score: d.score ?? 0,
            comments: d.num_comments ?? 0,
          },
          observedAt: isoFromUnix(d.created_utc),
        });
      }
    }
    return Array.from(seen.values());
  } catch (err) {
    logFailure("reddit", repo, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Bluesky — searchPosts (authenticated)
// ---------------------------------------------------------------------------

export async function searchBluesky(repo, session) {
  if (isChannelDisabled("bluesky")) return emptyResult("bluesky", "disabled via env");
  if (!session?.accessJwt) return emptyResult("bluesky", "no session — set BLUESKY_HANDLE/BLUESKY_APP_PASSWORD");
  const headers = {
    Authorization: `Bearer ${session.accessJwt}`,
    "User-Agent": UA,
    Accept: "application/json",
  };
  const queries = [
    `"github.com/${repo.fullName}"`,
    `"${repo.fullName}"`,
  ];
  const out = [];
  for (const q of queries) {
    try {
      const url = `https://bsky.social/xrpc/app.bsky.feed.searchPosts?${new URLSearchParams({
        q,
        sort: "latest",
        limit: "50",
      })}`;
      const data = await fetchJson(url, { headers });
      for (const p of data?.posts ?? []) {
        const handle = p.author?.handle ?? "";
        const rkey = (p.uri ?? "").split("/").pop();
        out.push({
          source: "bluesky",
          fullName: repo.fullName,
          url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : p.uri ?? "",
          title: truncate(p.record?.text ?? "", 200),
          text: truncate(p.record?.text ?? "", TEXT_TRUNCATE),
          author: handle || null,
          engagement: {
            score: (p.likeCount ?? 0) + (p.repostCount ?? 0),
            comments: p.replyCount ?? 0,
          },
          observedAt: p.indexedAt ?? nowIso(),
        });
      }
      // Stop after the first non-empty query — usually the URL form gets
      // exact hits and the slug form returns redundant noise.
      if (out.length > 0) break;
    } catch (err) {
      logFailure("bluesky", repo, err);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DevTo — public search-feed JSON
// ---------------------------------------------------------------------------

export async function searchDevto(repo) {
  if (isChannelDisabled("devto")) return emptyResult("devto", "disabled via env");
  // Public, unauthenticated search endpoint that powers dev.to's UI.
  // The endpoint is occasionally slow + flaky (5+ "operation aborted" timeouts
  // on top-100 sweep). Bumped per-call timeout to 25s and added one retry on
  // AbortError or HTTP 5xx with a 1s gap.
  const url = `https://dev.to/search/feed_content?per_page=30&class_name=Article&search_fields=body_text&q=${encodeURIComponent(repo.fullName)}`;
  let data;
  try {
    try {
      data = await fetchJson(url, { timeoutMs: 25_000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = err?.name === "AbortError" || msg.includes("aborted");
      const is5xx = /HTTP 5\d\d/.test(msg);
      if (!isAbort && !is5xx) throw err;
      await new Promise((r) => setTimeout(r, 1_000));
      data = await fetchJson(url, { timeoutMs: 25_000 });
    }
    const articles = data?.result ?? [];
    return articles.map((a) => ({
      source: "devto",
      fullName: repo.fullName,
      url: a.url ?? `https://dev.to${a.path ?? ""}`,
      title: truncate(a.title ?? "", 200),
      text: truncate(a.description ?? a.summary ?? "", TEXT_TRUNCATE),
      author: a.user?.username ?? null,
      engagement: {
        score: a.public_reactions_count ?? a.positive_reactions_count ?? 0,
        comments: a.comments_count ?? 0,
      },
      observedAt: a.published_at ?? a.readable_publish_date ?? nowIso(),
    }));
  } catch (err) {
    logFailure("devto", repo, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Lobsters — local snapshot filter (refreshed hourly by scrape-lobsters)
// ---------------------------------------------------------------------------

export async function searchLobsters(repo, snapshot) {
  if (isChannelDisabled("lobsters")) return emptyResult("lobsters", "disabled via env");
  if (!snapshot) return emptyResult("lobsters", "no snapshot loaded");
  const haystack = `${repo.fullName} github.com/${repo.fullName}`.toLowerCase();
  const stories = Array.isArray(snapshot.stories) ? snapshot.stories : [];
  const matches = stories.filter((s) => {
    const blob = `${s.title ?? ""} ${s.url ?? ""} ${s.description ?? ""}`.toLowerCase();
    return blob.includes(repo.fullName.toLowerCase()) ||
      blob.includes(`github.com/${repo.fullName}`.toLowerCase());
  });
  return matches.map((s) => ({
    source: "lobsters",
    fullName: repo.fullName,
    url: s.url ?? s.commentsUrl ?? "",
    title: truncate(s.title ?? "", 200),
    text: truncate(s.description ?? "", TEXT_TRUNCATE),
    author: s.submitter ?? s.submitter_user?.username ?? null,
    engagement: {
      score: s.score ?? 0,
      comments: s.commentCount ?? s.comment_count ?? 0,
    },
    observedAt: s.createdAt ?? s.created_at ?? nowIso(),
  }));
}

// ---------------------------------------------------------------------------
// ProductHunt — local launches snapshot (refreshed every 4-6h)
// ---------------------------------------------------------------------------

export async function searchProductHunt(repo, snapshot) {
  if (isChannelDisabled("producthunt")) return emptyResult("producthunt", "disabled via env");
  if (!snapshot) return emptyResult("producthunt", "no snapshot loaded");
  const launches = Array.isArray(snapshot.launches) ? snapshot.launches : [];
  const fullLower = repo.fullName.toLowerCase();
  const matches = launches.filter((l) => {
    if (l.linkedRepo && l.linkedRepo.toLowerCase() === fullLower) return true;
    const website = l.website?.toLowerCase() ?? "";
    return website.includes(`github.com/${fullLower}`);
  });
  return matches.map((l) => ({
    source: "producthunt",
    fullName: repo.fullName,
    url: l.url ?? "",
    title: truncate(l.name ?? "", 200),
    text: truncate(l.tagline ?? l.description ?? "", TEXT_TRUNCATE),
    author: Array.isArray(l.makers) ? l.makers.map((m) => m.username).filter(Boolean).join(", ") || null : null,
    engagement: {
      score: l.votesCount ?? 0,
      comments: l.commentsCount ?? 0,
    },
    observedAt: l.createdAt ?? l.featuredAt ?? nowIso(),
  }));
}

// ---------------------------------------------------------------------------
// Tavily — REST web search (NEW)
// ---------------------------------------------------------------------------

export async function searchTavily(repo, apiKey) {
  if (isChannelDisabled("tavily")) return emptyResult("tavily", "disabled via env");
  if (!apiKey) return emptyResult("tavily", "TAVILY_API_KEY not set");

  // Cache key is the canonical repo query — same `"owner/name" github`
  // string the API sees. 24h TTL (see _tavily-cache.mjs). Cache hit returns
  // the previously-mapped Mention[] verbatim and skips the API call.
  const cacheKey = `"${repo.fullName}" github`;
  const cached = await getCachedTavily(repo, cacheKey);
  if (cached) {
    console.log(`[xs:tavily] cache hit ${repo.fullName}`);
    return cached;
  }

  const body = {
    api_key: apiKey,
    query: cacheKey,
    search_depth: "basic",
    time_range: "week",
    max_results: 10,
    include_answer: false,
    include_raw_content: false,
  };
  try {
    const data = await fetchJson("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const results = Array.isArray(data?.results) ? data.results : [];
    const mentions = results
      .filter((r) => {
        // Tavily often returns the repo's own GitHub page — exclude it
        // as a self-mention; we want third-party blog/article coverage.
        const u = String(r.url ?? "").toLowerCase();
        return !u.includes(`github.com/${repo.fullName.toLowerCase()}`);
      })
      .map((r) => ({
        source: "tavily",
        fullName: repo.fullName,
        url: r.url ?? "",
        title: truncate(r.title ?? "", 200),
        text: truncate(r.content ?? "", TEXT_TRUNCATE),
        author: null,
        engagement: {
          score: typeof r.score === "number" ? Math.round(r.score * 100) : 0,
        },
        observedAt: r.published_date ?? nowIso(),
      }));
    // Cache even an empty array — a "no results" answer is also worth
    // caching for 24h to skip the API hit on the next sweep.
    await setCachedTavily(repo, cacheKey, mentions);
    return mentions;
  } catch (err) {
    logFailure("tavily", repo, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Twitter — Apify per-repo query bundle (Tier 1)
// ---------------------------------------------------------------------------
//
// The Twitter adapter takes a pre-built array of query strings (from
// buildTwitterQueryBundle in src/lib/twitter/query-bundle.ts) plus an Apify
// token. Stays optional: when APIFY_API_TOKEN is missing we return [] and
// log nothing (the sweep is a quiet no-op for Twitter on local dev).
//
// Cost telemetry: every successful call logs
//   [xs:twitter:cost] $X.XXXX ($per-tweet × N tweets) actor=<id>
// The orchestrator can `grep` for that line to sum per-run spend without
// changing the return signature (still Mention[]).

export async function searchTwitter(repo, queryStrings, opts = {}) {
  if (isChannelDisabled("twitter")) return emptyResult("twitter", "disabled via env");
  const token = opts.token ?? process.env.APIFY_API_TOKEN;
  if (!token) return emptyResult("twitter", "APIFY_API_TOKEN not set");
  if (!Array.isArray(queryStrings) || queryStrings.length === 0) return [];

  // Actor handle is configurable so we can swap implementations without
  // touching code. Apify Twitter scraper price ladder (per 1k tweets,
  // verified 2026-05; check the actor page before committing to a plan):
  //
  //   xquik~x-tweet-scraper                 ~$0.15 — cheapest tested
  //   get-leads~all-in-one-x-scraper        ~$0.20
  //   kaitoeasyapi~twitter-x-data-...       ~$0.25
  //   automation-lab~twitter-scraper        ~$0.31 (pay-per-event)
  //   apidojo~tweet-scraper                 ~$0.40 — current default
  //   apidojo~twitter-scraper-lite          ~$0.40 — same vendor lite variant
  //
  // All accept the same minimal input (`searchTerms` + `maxItems`); the
  // body below also passes `sort` / `tweetLanguage` for the apidojo style
  // and `queryType` / `lang` for the xquik style so either picks up its
  // preferred keys.
  //
  // Override per-call with opts.actorId or globally with APIFY_TWITTER_ACTOR.
  // Switching default apidojo → xquik on the top-100 × 4-queries × 4-sweeps
  // schedule is ≈$300/mo Apify savings; validate output schema parity in
  // the sample data before flipping production default.
  const rawActor =
    opts.actorId ??
    process.env.APIFY_TWITTER_ACTOR ??
    "apidojo~tweet-scraper";
  // Apify accepts both `owner/name` and `owner~name`; the URL path uses ~.
  const actorId = rawActor.replace("/", "~");
  const tweetsPerQuery = opts.tweetsPerQuery ?? 25;
  // Apify run-sync endpoint blocks until the actor finishes — fine for
  // small per-repo runs but we cap with a generous 60s per request to
  // avoid pinning the worker on a hung actor.
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  // Body uses the union of input keys — each actor reads what it knows:
  //   apidojo:    searchTerms, maxItems, sort, tweetLanguage
  //   xquik:      searchTerms, maxItems, queryType, lang
  //   automation-lab + others: searchTerms, maxItems, sort
  // Sending all keys keeps this adapter actor-agnostic.
  const body = {
    searchTerms: queryStrings,
    maxItems: tweetsPerQuery * queryStrings.length,
    sort: "Latest",
    queryType: "Latest",
    tweetLanguage: "en",
    lang: "en",
  };
  try {
    const items = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 60_000,
    });
    if (!Array.isArray(items)) return [];
    // Cost meter: estimate spend = tweetsReturned × per-tweet rate. Logged
    // before mapping so it appears even if the map is empty. Orchestrator
    // can grep `[xs:twitter:cost]` for run-level spend totals.
    const perTweet = costPerTweetFor(actorId);
    const costUsd = items.length * perTweet;
    console.log(
      `[xs:twitter:cost] $${costUsd.toFixed(4)} ($${perTweet} × ${items.length}) actor=${actorId}`,
    );
    return items.map((t) => {
      const author = t.author?.userName ?? t.author?.handle ?? t.username ?? null;
      const tweetUrl =
        t.url ??
        (author && t.id ? `https://x.com/${author}/status/${t.id}` : "");
      return {
        source: "twitter",
        fullName: repo.fullName,
        url: tweetUrl,
        title: truncate(t.text ?? "", 200),
        text: truncate(t.text ?? "", TEXT_TRUNCATE),
        author,
        engagement: {
          score: (t.likeCount ?? t.favorite_count ?? 0) + (t.retweetCount ?? 0),
          comments: t.replyCount ?? 0,
        },
        observedAt: t.createdAt ?? t.created_at ?? nowIso(),
      };
    });
  } catch (err) {
    logFailure("twitter", repo, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Adapter dispatch (used by the main sweep script)
// ---------------------------------------------------------------------------

export const ALL_CHANNELS = [
  "twitter",
  "reddit",
  "hackernews",
  "bluesky",
  "devto",
  "lobsters",
  "producthunt",
  "tavily",
];
