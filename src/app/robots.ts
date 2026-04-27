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
const AI_CRAWLERS: ReadonlyArray<string> = [
  "GPTBot",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "anthropic-ai",
  "Cohere-ai",
  "meta-externalagent",
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
    ],
    host: absoluteUrl("/"),
  };
}
