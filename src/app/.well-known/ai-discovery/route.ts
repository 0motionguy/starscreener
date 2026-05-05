// TrendingRepo — /.well-known/ai-discovery
//
// Machine-readable discovery manifest for AI crawlers/agents.
// Keeps canonical pointers in one place so clients can bootstrap
// from the well-known prefix and then fetch llms artifacts.

import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 86400;

export function GET(): Response {
  const base = SITE_URL.replace(/\/+$/, "");
  const body = {
    version: "1",
    provider: "TrendingRepo",
    website: base,
    updatedAt: new Date().toISOString(),
    endpoints: {
      llmsTxt: `${base}/llms.txt`,
      llmsFullTxt: `${base}/llms-full.txt`,
      wellKnownLlmsTxt: `${base}/.well-known/llms.txt`,
      sitemap: `${base}/sitemap.xml`,
      robots: `${base}/robots.txt`,
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
