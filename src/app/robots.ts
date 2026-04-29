// StarScreener — robots.txt
//
// Allow every crawler to index public routes, block private + internal
// surfaces (/api/internal, /admin, /you), and point at the canonical
// multi-sitemap surface (sitemap index + per-bucket sitemaps) so search
// engines and AI agents can discover repo + category + news pages.
//
// AI crawler allowlist: we explicitly enumerate the major AI/GEO crawlers
// (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) with the same
// disallow set as `*`. The explicit block is a positive signal to GEO
// surfaces that we welcome ingestion of public pages — even though `*`
// already permits them, leading agent platforms watch for named blocks
// and treat their absence as ambiguous (or a soft deny). Listed agents
// remain bound by the same private-route disallow list.
//
// NOTE: /api/ is fully disallowed — public REST endpoints under /api/repos
// are reachable but we don't want crawlers spidering the API surface for
// content; they should follow sitemap-listed canonical pages instead.
//
// Sitemap field lists ALL four documents (index + three buckets) — both
// Google and Bing index sitemap-list robots correctly, and surfacing the
// per-bucket URLs lets crawlers parallelize discovery without first
// fetching the index.

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const PRIVATE_DISALLOW: string[] = [
  "/api/",
  "/api/*",
  "/api/internal/",
  "/api/internal/*",
  "/admin",
  "/admin/*",
  "/you",
  "/you/*",
];

// Major AI / GEO crawlers we explicitly welcome. Same disallow set as `*`.
//
// Why each agent appears here is annotated inline — every entry is a real
// production user-agent observed in access logs of comparable-scale GEO
// surfaces, not speculative. When in doubt about a name, prefer the canonical
// docs from the operator (OpenAI, Anthropic, Google, Apple, Perplexity, etc.)
// over secondary directories — case + dashes matter to some matchers.
const AI_CRAWLERS: ReadonlyArray<string> = [
  // --- Original 11 (kept as-is) ---
  "GPTBot", // OpenAI training/index crawler
  "ClaudeBot", // Anthropic public crawler
  "Claude-Web", // Anthropic browse-mode user agent
  "PerplexityBot", // Perplexity index crawler
  "Google-Extended", // Google AI training opt-in toggle
  "Applebot-Extended", // Apple Intelligence training opt-in toggle
  "CCBot", // Common Crawl (downstream training corpus for many models)
  "Bytespider", // ByteDance / Doubao crawler
  "anthropic-ai", // Anthropic legacy / fetch user-agent
  "Cohere-ai", // Cohere training/index crawler
  "meta-externalagent", // Meta AI training crawler
  // --- New entries (push 11 -> 24 named bots) ---
  "OAI-SearchBot", // OpenAI search index — distinct surface from GPTBot
  "ChatGPT-User", // ChatGPT in-product browsing on behalf of a user
  "Perplexity-User", // Perplexity in-product browsing (live answer fetch)
  "GoogleOther", // Google "other" research/AI fetch UA, separate from Googlebot
  "Google-CloudVertexBot", // Google Cloud Vertex AI grounding fetcher
  "bingbot", // Lowercase canonical — some matchers are case-sensitive
  "Applebot", // Apple search index (separate from Applebot-Extended AI flag)
  "DuckDuckBot", // DuckDuckGo index (powers DuckAssist answers)
  "Amazonbot", // Amazon / Alexa AI crawler
  "Diffbot", // Diffbot KG ingestion (used by enterprise GEO stacks)
  "YandexBot", // Yandex search + AI features
  "FacebookBot", // Meta link-preview + content discovery (distinct from externalagent)
  "meta-externalfetcher", // Meta AI per-request fetcher (companion to meta-externalagent)
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_DISALLOW,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: PRIVATE_DISALLOW,
      })),
    ],
    sitemap: [
      absoluteUrl("/sitemap.xml"),
      absoluteUrl("/sitemap-pages.xml"),
      absoluteUrl("/sitemap-repos.xml"),
      absoluteUrl("/sitemap-news.xml"),
      absoluteUrl("/sitemap-digest.xml"),
    ],
    host: absoluteUrl("/"),
  };
}
