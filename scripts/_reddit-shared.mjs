// Shared config for all Reddit scrapers (scrape-reddit, compute-reddit-baselines).
// Single source of truth so the sub list, UA, and fetch helper stay in sync.
//
// Default mode is Reddit's public JSON. When REDDIT_CLIENT_ID is present we
// upgrade transparently to OAuth and hit oauth.reddit.com instead. That keeps
// the scraper working when anonymous GH Actions traffic starts getting 403s.

import { fetchJsonWithRetry } from "./_fetch-json.mjs";

const DEFAULT_USER_AGENT =
  "StarScreener/0.1 (+https://github.com/0motionguy/starscreener; reddit-scrape)";
const PUBLIC_REDDIT_ORIGIN = "https://www.reddit.com";
const TOKEN_URL = `${PUBLIC_REDDIT_ORIGIN}/api/v1/access_token`;

let oauthTokenCache = null;

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
  const headers = {
    "User-Agent": getRedditUserAgent(),
    Accept: "application/json",
  };

  if (hasRedditOAuthCreds()) {
    headers.Authorization = `Bearer ${await getRedditAccessToken(fetchImpl)}`;
  }

  return fetchJsonWithRetry(resolveRedditApiUrl(url), {
    headers,
    attempts: 2,
    retryDelayMs: 1000,
    timeoutMs: 15_000,
    fetchImpl,
  });
}
