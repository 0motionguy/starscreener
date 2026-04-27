// TrendingRepo — /llms.txt (short index for LLM crawlers)
//
// What is llms.txt?
//   An emerging discovery standard for AI crawlers / agents,
//   spec'd at https://llmstxt.org. Equivalent to robots.txt but
//   pointed at LLM ingestion: a small, plain-markdown index that
//   tells a model "here is what this site is, here are the
//   primary surfaces, and here is a longer companion doc with
//   actual content". Backed by Mintlify, Anthropic, and a growing
//   list of doc platforms — sites that ship llms.txt are
//   first-class citizens for retrieval-augmented agents.
//
// This is the SHORT INDEX.
//   It contains zero per-repo data; it's a navigation map. The
//   long form lives at /llms-full.txt and dumps the top 100 repos
//   as markdown blocks for direct ingestion into a model context
//   window. Crawlers are expected to fetch the short index first,
//   then optionally pull the full file when they need data.
//
// Cache: 24h. The list of surfaces moves on the order of weeks,
// not minutes — no point revalidating more often.

import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 86400;

export function GET(): Response {
  const base = SITE_URL.replace(/\/+$/, "");
  const body = `# TrendingRepo

> The trend map for open source. Real-time scanner that aggregates GitHub stars, Twitter buzz, Reddit, Hacker News, ProductHunt, Bluesky, and dev.to signals to surface breakout repos before they go mainstream.

## About

- Live data: GitHub (stars/forks/releases/contributors), Reddit, Hacker News, ProductHunt, Bluesky, dev.to, Lobsters
- Refresh cadence: every 3 hours via GitHub Actions
- Momentum scoring: 0-100 composite score combining 24h/7d/30d star velocity, fork growth, contributor churn, commit freshness, release cadence
- Cross-signal classification: repos firing on multiple channels are flagged as "Cross-Signal Breakouts"

## Primary surfaces

- [Home](${base}/) - top 80 trending repos by 24h star delta
- [Breakouts](${base}/breakouts) - cross-signal breakout repos
- [Funding](${base}/funding) - funding signals from TechCrunch / VentureBeat
- [Twitter](${base}/twitter) - repos trending on X
- [News](${base}/news) - unified terminal across HN, Bluesky, dev.to, ProductHunt, Lobsters, Reddit
- [Categories](${base}/categories) - 15 curated buckets (AI Agents, MCP, DevTools, Local LLM, Security, etc.)
- [Collections](${base}/collections) - 28 curated OSS Insight collections

## Per-source feeds

- [Hacker News](${base}/hackernews/trending)
- [Bluesky](${base}/bluesky/trending)
- [dev.to](${base}/devto)
- [ProductHunt](${base}/producthunt)
- [Lobsters](${base}/lobsters)
- [Reddit](${base}/reddit)

## Programmatic access

- [Public REST API](${base}/docs) - under /api/repos with filtering, sorting, pagination
- [MCP server](${base}/docs) - for Claude / agentic clients
- [CLI](${base}/docs) - zero-dependency Node 18+
- [Sitemap](${base}/sitemap.xml) - full URL index
- [llms-full.txt](${base}/llms-full.txt) - top 100 repos as markdown blocks

## Optional

- [Search](${base}/search)
- [Compare repos](${base}/compare)
- [Submit a repo](${base}/submit)
- [Pricing](${base}/pricing)

## License

Aggregated metadata under fair-use indexing. Underlying GitHub repos retain their own licenses.
`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}
