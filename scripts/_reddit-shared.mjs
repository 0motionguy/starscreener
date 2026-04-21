// Shared config for all Reddit scrapers (scrape-reddit, compute-reddit-baselines).
// Single source of truth so the sub list, UA, and fetch helper stay in sync.
//
// Reddit's public JSON endpoints require a descriptive User-Agent per their
// API policy — browser-default UAs get rate-limited aggressively. In
// practice, anonymous limits are closer to ~15 req/min than the old 60/min
// folklore, so the shared pause stays at 5s/request (~12 req/min).

import { fetchJsonWithRetry } from "./_fetch-json.mjs";

export const USER_AGENT =
  "StarScreener/0.1 (+https://github.com/0motionguy/starscreener; local-dev-scrape)";

export const REQUEST_PAUSE_MS = 5000;

// Subreddit list mirrors agnt.newsroom's reddit_ai_core + reddit_ai_extended
// watchers (config/watchers.yaml). Two tiers:
//   - core: highest signal density for AI dev tooling (14)
//   - extended: broader ecosystem — coding, frameworks, automation (31)
// Note: r/ArtificialInteligence is intentionally misspelled (single 'l') —
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchRedditJson(url) {
  return fetchJsonWithRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    attempts: 2,
    retryDelayMs: 1000,
    timeoutMs: 15_000,
  });
}
