// Shared config for all Reddit scrapers (scrape-reddit, compute-reddit-baselines).
// Single source of truth so the sub list, UA, and fetch helper stay in sync.
//
// Default mode is Reddit's public JSON. When REDDIT_CLIENT_ID is present we
// upgrade transparently to OAuth and hit oauth.reddit.com instead. That keeps
// the scraper working when anonymous GH Actions traffic starts getting 403s.

import {
  fetchJsonWithRetry,
  fetchWithTimeout,
  HttpStatusError,
} from "./_fetch-json.mjs";

// Real-browser UA — Reddit's anti-bot started 403'ing the previous
// "TrendingRepo/0.2 …" identifier (formerly "StarScreener/0.1 …") from
// GitHub Actions IPs around 2026-04-23. Without this, the public-JSON
// fallback path is dead.
// (The OAuth path identifies properly via client credentials and uses a
// dedicated UA at request time, so this only affects unauth scraping.)
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const PUBLIC_REDDIT_ORIGIN = "https://www.reddit.com";
const TOKEN_URL = `${PUBLIC_REDDIT_ORIGIN}/api/v1/access_token`;

// `old.reddit.com` serves the same JSON but with markedly more permissive
// anti-bot rules. Used only on the public-json path — OAuth requests still
// go to oauth.reddit.com via resolveRedditApiUrl().
const OLD_REDDIT_ORIGIN = "https://old.reddit.com";

function rewriteToOldReddit(url) {
  try {
    const u = new URL(url);
    if (u.origin === PUBLIC_REDDIT_ORIGIN) {
      u.protocol = "https:";
      u.host = "old.reddit.com";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

let oauthTokenCache = null;
let fetchRuntime = createFetchRuntime();

function createFetchRuntime() {
  return {
    preferredMode: null,
    activeMode: null,
    fallbackUsed: false,
    oauthFailures: 0,
    oauthRequests: 0,
    publicRequests: 0,
    lastOauthError: null,
  };
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function getRedditUserAgent() {
  return readEnv("REDDIT_USER_AGENT") || DEFAULT_USER_AGENT;
}

export function hasRedditOAuthCreds() {
  return readEnv("REDDIT_CLIENT_ID").length > 0;
}

export function getRedditAuthMode() {
  return hasRedditOAuthCreds() ? "oauth" : "public-json";
}

export function resolveRedditApiUrl(url) {
  if (!hasRedditOAuthCreds()) return url;
  const resolved = new URL(url);
  if (resolved.origin === PUBLIC_REDDIT_ORIGIN) {
    resolved.protocol = "https:";
    resolved.host = "oauth.reddit.com";
  }
  return resolved.toString();
}

function getOAuthCacheKey() {
  const clientId = readEnv("REDDIT_CLIENT_ID");
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? "";
  return `${clientId}:${clientSecret}`;
}

async function getRedditAccessToken(fetchImpl = fetch) {
  if (!hasRedditOAuthCreds()) return null;

  const cacheKey = getOAuthCacheKey();
  const now = Date.now();
  if (
    oauthTokenCache &&
    oauthTokenCache.cacheKey === cacheKey &&
    oauthTokenCache.expiresAtMs > now + 60_000
  ) {
    return oauthTokenCache.accessToken;
  }

  const clientId = readEnv("REDDIT_CLIENT_ID");
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? "";
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
    "base64",
  );
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
  }).toString();

  const token = await fetchJsonWithRetry(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": getRedditUserAgent(),
    },
    body: tokenBody,
    attempts: 2,
    retryDelayMs: 1000,
    timeoutMs: 15_000,
    fetchImpl,
  });

  if (!token?.access_token || typeof token.access_token !== "string") {
    throw new Error("reddit oauth token response missing access_token");
  }

  const expiresInSec =
    Number.isFinite(token.expires_in) && token.expires_in > 0
      ? token.expires_in
      : 3600;
  oauthTokenCache = {
    cacheKey,
    accessToken: token.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return oauthTokenCache.accessToken;
}

export function resetRedditAuthCacheForTests() {
  oauthTokenCache = null;
  fetchRuntime = createFetchRuntime();
}

export function getRedditFetchRuntime() {
  return { ...fetchRuntime };
}

export const REQUEST_PAUSE_MS = 5000;

// Subreddit list mirrors agnt.newsroom's reddit_ai_core + reddit_ai_extended
// watchers (config/watchers.yaml). Two tiers:
//   - core: highest signal density for AI dev tooling (14)
//   - extended: broader ecosystem - coding, frameworks, automation (31)
// Note: r/ArtificialInteligence is intentionally misspelled (single 'l') -
// that's the actual subreddit URL; the correctly-spelled version is a
// squat with 1k members.
export const SUBREDDITS = [
  // --- Core: LLM-specific (highest AGNT relevance) ---
  "ClaudeAI",
  "ChatGPT",
  "OpenAI",
  "LocalLLaMA",
  "GeminiAI",
  "DeepSeek",
  "Perplexity_AI",
  "MistralAI",
  "grok",
  // --- Core: Agent & automation ---
  "AI_Agents",
  "AgentsOfAI",
  "LLMDevs",
  "ClaudeCode",
  "aiagents",
  // --- Extended: General AI mega subs ---
  "ArtificialInteligence",
  "MachineLearning",
  "artificial",
  "singularity",
  "datascience",
  // --- Extended: Coding & tools ---
  "vibecoding",
  "cursor",
  "ChatGPTCoding",
  "ChatGPTPromptGenius",
  // --- Extended: Prompts & building ---
  "PromptEngineering",
  "AIToolTesting",
  "AIBuilders",
  "AIAssisted",
  // --- Extended: Learning & research ---
  "learnmachinelearning",
  "deeplearning",
  "LocalLLM",
  "GoogleGeminiAI",
  // --- Extended: Frameworks & automation ---
  "n8n",
  "automation",
  "LangChain",
  "generativeAI",
  "Rag",
  // --- Extended: Content & distribution ---
  "SEO",
  "WritingWithAI",
  "SaaS",
  "machinelearningnews",
  // --- Extended: Coding agents & tools ---
  "ollama",
  "LLM",
  "CLine",
  "windsurf",
  "nocode",
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Atom RSS parser — fallback path for the "no OAuth + IP-blocked" case.
// ---------------------------------------------------------------------------
//
// 2026-04-25: probe run 24920554678 confirmed every Reddit JSON endpoint
// (www, old, np, i, m, gateway) returns 403 from GH Actions egress IPs. The
// only paths that returned real content were `/r/X/new/.rss` and
// `/r/X/new/.rss` on old.reddit.com — both serve full Atom feeds (~36KB
// for active subs).
//
// Reddit's Atom RSS exposes fewer fields than the JSON API:
//   - id, title, author, subreddit, created_utc, url, permalink, selftext,
//     is_self  → all reconstructible from <entry> elements
//   - score, num_comments, link_flair_text → NOT EXPOSED. Default to 0 / null.
//
// Downstream scoring degrades cleanly when score=0:
//   - velocity → 0
//   - trendingScore → 0
//   - baselineRatio → null (UI marks as "niche sub")
//   - mentions are still extracted, indexed, and displayed
// So the loss is "no breakout ranking" not "no data at all".

const SUBREDDIT_FROM_PATH_RE = /\/r\/([A-Za-z0-9_]+)\/new(?:\.json|\/\.rss)/;

function decodeHtmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#32;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // do amp last to avoid double-decoding
}

function stripHtmlTags(s) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractTagBody(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractTagAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

/**
 * Parse a Reddit Atom RSS feed body into the same `{ data: { children:
 * [{ data: ... }] } }` shape that `/r/X/new.json` returns. Caller code in
 * scrape-reddit.mjs / compute-reddit-baselines.mjs consumes the result
 * unchanged.
 *
 * `fallbackSubreddit` is used only when an entry doesn't carry its own
 * <category term="X"/> (Reddit's RSS always includes it, but defensively
 * we accept a fallback so a malformed feed degrades to the URL's sub).
 */
export function parseRedditAtomFeed(xmlText, fallbackSubreddit) {
  const children = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xmlText)) !== null) {
    const entry = m[1];

    // <id>t3_XXXXX</id> — strip the t3_ thing-prefix so caller's `p.id`
    // matches the JSON-API value (the bare base36 id).
    const idRaw = extractTagBody(entry, "id");
    const idMatch = idRaw?.match(/t3_([a-z0-9]+)/i);
    if (!idMatch) continue;
    const id = idMatch[1];

    const title = decodeHtmlEntities(extractTagBody(entry, "title") ?? "").trim();
    if (!title) continue;

    const published = extractTagBody(entry, "published");
    const createdMs = published ? Date.parse(published) : NaN;
    if (!Number.isFinite(createdMs)) continue;
    const created_utc = Math.floor(createdMs / 1000);

    const authorBlock = extractTagBody(entry, "author") ?? "";
    const authorName = extractTagBody(authorBlock, "name") ?? "";
    const author = authorName.replace(/^\/u\//, "").trim();

    const subreddit = extractTagAttr(entry, "category", "term") ?? fallbackSubreddit ?? "";

    const linkHref = extractTagAttr(entry, "link", "href") ?? "";

    // <content type="html">…HTML-encoded body…</content>
    const contentRaw = extractTagBody(entry, "content") ?? "";
    const contentHtml = decodeHtmlEntities(contentRaw);

    // Self-vs-link: a self post's <link href> points back to its own
    // /comments/ID/ URL on reddit.com. A link post's <link href> is the
    // external URL.
    const isSelf = linkHref.includes(`/comments/${id}/`);

    // Permalink resolution. For self posts, parse it from <link href>.
    // For link posts, the [comments] anchor inside <content> is the
    // canonical /comments/ URL.
    let permalink = "";
    if (isSelf) {
      const pm = linkHref.match(/(\/r\/[^/]+\/comments\/[^/]+\/[^/?#]+\/?)/);
      permalink = pm?.[1] ?? "";
    } else {
      const pm = contentHtml.match(
        /href="https:\/\/www\.reddit\.com(\/r\/[^/]+\/comments\/[^/]+\/[^/?"#]+\/?)/,
      );
      permalink = pm?.[1] ?? `/r/${subreddit}/comments/${id}/`;
    }

    // Selftext: reddit wraps the markdown-rendered body in
    // `<!-- SC_OFF -->...<!-- SC_ON -->`. Anything outside is the
    // "submitted by … [link] [comments]" boilerplate.
    let selftext = "";
    if (isSelf) {
      const sm = contentHtml.match(/<!--\s*SC_OFF\s*-->([\s\S]*?)<!--\s*SC_ON\s*-->/);
      if (sm) selftext = stripHtmlTags(sm[1]).slice(0, 5000);
    }

    const url = isSelf ? `https://www.reddit.com${permalink}` : linkHref;

    children.push({
      data: {
        id,
        name: `t3_${id}`,
        title,
        author,
        subreddit,
        url,
        permalink,
        selftext,
        is_self: isSelf,
        created_utc,
        score: 0,            // RSS doesn't expose upvotes
        num_comments: 0,     // RSS doesn't expose comment count
        link_flair_text: null, // RSS doesn't expose flair
        _source: "rss-atom",
      },
    });
  }
  return { data: { children, after: null, before: null } };
}

/**
 * Map a Reddit JSON listing URL (`/r/X/new.json?...`) to its RSS-Atom
 * equivalent (`/r/X/new/.rss?...`). Returns the input unchanged when the
 * URL isn't a listing path the RSS endpoint can serve.
 */
function rewriteToRss(url) {
  try {
    const u = new URL(url);
    if (!u.pathname.match(/\/r\/[A-Za-z0-9_]+\/new\.json$/)) return url;
    u.pathname = u.pathname.replace(/\.json$/, "/.rss");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Text-shaped sibling of `fetchJsonWithRetry`. Used for the RSS fallback —
 * the response body is XML, not JSON, so we can't go through the JSON
 * helper without it parse-failing.
 */
async function fetchTextWithRetry(
  url,
  { attempts = 2, retryDelayMs = 1000, timeoutMs = 15_000, fetchImpl = fetch, headers } = {},
) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, { fetchImpl, timeoutMs, headers });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpStatusError(res, url, text);
        if (attempt < attempts && (res.status >= 500 || res.status === 429)) {
          lastErr = err;
          await sleep(retryDelayMs * attempt);
          continue;
        }
        throw err;
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts) throw err;
      await sleep(retryDelayMs * attempt);
    }
  }
  throw lastErr ?? new Error(`fetchTextWithRetry: exhausted attempts for ${url}`);
}

export async function fetchRedditJson(url, { fetchImpl = fetch } = {}) {
  const userAgent = getRedditUserAgent();
  // Full browser-shaped header set. Reddit's anti-bot looks at the UA + the
  // accompanying headers as a coherent profile; bare UA without sec-fetch-*
  // or accept-language is a tell. This won't bypass IP-level blocks (GH
  // Actions ranges are dropped at the edge regardless of headers) but it
  // does bypass the Cloudflare-tier check that fires on residential IPs
  // with a bare-UA request.
  const publicHeaders = {
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Ch-Ua":
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
  };

  fetchRuntime.preferredMode = hasRedditOAuthCreds() ? "oauth" : "public-json";

  if (!hasRedditOAuthCreds()) {
    fetchRuntime.activeMode = "public-json";
    fetchRuntime.publicRequests += 1;

    // Listing URLs (/r/X/new.json) hit Reddit's edge IP block from GH
    // Actions. The RSS variant of the same listing returns 200 and
    // unauthenticated content. Detect listing URLs and route them through
    // the Atom-feed parser; everything else (e.g. /r/X/about.json) keeps
    // the original JSON path so callers that need fields RSS doesn't expose
    // still degrade gracefully when they 403.
    const rssUrl = rewriteToRss(url);
    if (rssUrl !== url) {
      const subMatch = url.match(SUBREDDIT_FROM_PATH_RE);
      const fallbackSub = subMatch?.[1] ?? "";
      const rssText = await fetchTextWithRetry(rssUrl, {
        headers: {
          ...publicHeaders,
          Accept: "application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        attempts: 2,
        retryDelayMs: 1000,
        timeoutMs: 15_000,
        fetchImpl,
      });
      return parseRedditAtomFeed(rssText, fallbackSub);
    }

    return fetchJsonWithRetry(rewriteToOldReddit(url), {
      headers: publicHeaders,
      attempts: 2,
      retryDelayMs: 1000,
      timeoutMs: 15_000,
      fetchImpl,
    });
  }

  try {
    const accessToken = await getRedditAccessToken(fetchImpl);
    fetchRuntime.activeMode = "oauth";
    fetchRuntime.oauthRequests += 1;
    return await fetchJsonWithRetry(resolveRedditApiUrl(url), {
      headers: {
        ...publicHeaders,
        Authorization: `Bearer ${accessToken}`,
      },
      attempts: 2,
      retryDelayMs: 1000,
      timeoutMs: 15_000,
      fetchImpl,
    });
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : null;
    const fallbackAllowed =
      status === null ||
      status === 401 ||
      status === 403 ||
      status === 408 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504;

    fetchRuntime.oauthFailures += 1;
    fetchRuntime.lastOauthError =
      err instanceof Error ? err.message : String(err);

    if (!fallbackAllowed) throw err;

    fetchRuntime.fallbackUsed = true;
    fetchRuntime.activeMode = "public-json";
    fetchRuntime.publicRequests += 1;
    return fetchJsonWithRetry(rewriteToOldReddit(url), {
      headers: publicHeaders,
      attempts: 2,
      retryDelayMs: 1000,
      timeoutMs: 15_000,
      fetchImpl,
    });
  }
}

// SCR-10: shared identity terms used by reddit-side classification.
// Tokens that match GitHub-repo names but don't carry signal — we drop
// them from candidate term sets so we don't recommend "ai-llm-tools"
// every other recommendation. Lives here so any reddit-touching script
// stays in sync; previously inlined in scripts/scrape-reddit.mjs only.
export const GENERIC_TERMS = new Set([
  "ai",
  "agent",
  "agents",
  "app",
  "apps",
  "api",
  "assistant",
  "assistants",
  "awesome",
  "bot",
  "career",
  "careers",
  "chat",
  "cli",
  "client",
  "code",
  "content",
  "core",
  "context",
  "contexts",
  "data",
  "docs",
  "engine",
  "framework",
  "flow",
  "flows",
  "gallery",
  "kit",
  "lib",
  "library",
  "llm",
  "llms",
  "local",
  "manifest",
  "memory",
  "model",
  "models",
  "mode",
  "modes",
  "plugin",
  "prompt",
  "prompts",
  "project",
  "repo",
  "sdk",
  "server",
  "service",
  "skill",
  "skills",
  "tool",
  "tools",
  "ui",
  "usage",
  "utils",
  "voice",
  "web",
  "wiki",
]);
