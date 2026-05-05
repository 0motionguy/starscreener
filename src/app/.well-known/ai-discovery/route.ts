// TrendingRepo — /.well-known/ai-discovery
//
// Machine-readable discovery manifest for AI crawlers/agents.
// Keeps canonical pointers in one place so clients can bootstrap
// from the well-known prefix and then fetch llms artifacts.

import { absoluteUrl, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 86400;

export function GET(): Response {
  const body = {
    version: "1",
    provider: SITE_NAME,
    description: SITE_DESCRIPTION,
    website: absoluteUrl("/"),
    endpoints: {
      llmsTxt: absoluteUrl("/llms.txt"),
      llmsFullTxt: absoluteUrl("/llms-full.txt"),
      wellKnownLlmsTxt: absoluteUrl("/.well-known/llms.txt"),
      sitemap: absoluteUrl("/sitemap.xml"),
      robots: absoluteUrl("/robots.txt"),
      mentionsApi: absoluteUrl("/api/repos"),
    },
    capabilities: {
      discovery: true,
      mentions: true,
      trending: true,
      briefs: true,
    },
    importantUrls: {
      trending: absoluteUrl("/"),
      breakouts: absoluteUrl("/breakouts"),
      signals: absoluteUrl("/signals"),
      funding: absoluteUrl("/funding"),
      briefs: absoluteUrl("/brief"),
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}
