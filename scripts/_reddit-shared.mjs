// Shared config for all Reddit scrapers (scrape-reddit, compute-reddit-baselines).
// Single source of truth so the sub list, UA, and fetch helper stay in sync.
//
// Default mode is Reddit's public JSON. When REDDIT_CLIENT_ID is present we
// upgrade transparently to OAuth and hit oauth.reddit.com instead. That keeps
// the scraper working when anonymous GH Actions traffic starts getting 403s.

import { fetchJsonWithRetry } from "./_fetch-json.mjs";

// Real-browser UA — Reddit's anti-bot started 403'ing the previous
// "StarScreener/0.1 …" identifier from GitHub Actions IPs around
// 2026-04-23. Without this, the public-JSON fallback path is dead.
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

export async function fetchRedditJson(url, { fetchImpl = fetch } = {}) {
  const userAgent = getRedditUserAgent();
  const publicHeaders = {
    "User-Agent": userAgent,
    Accept: "application/json",
  };

  fetchRuntime.preferredMode = hasRedditOAuthCreds() ? "oauth" : "public-json";

  if (!hasRedditOAuthCreds()) {
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
