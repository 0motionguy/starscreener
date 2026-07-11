import { NextResponse } from "next/server";

import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  const base = SITE_URL.replace(/\/+$/, "");
  return NextResponse.json(
    {
      name: "TrendingRepo",
      description: "Agent-operated trend terminal for public repository intelligence.",
      url: base,
      endpoints: {
        home: `${base}/`,
        search: `${base}/search`,
        compare: `${base}/compare`,
        mcp: `${base}/api/mcp`,
        openapi: `${base}/.well-known/openapi.json`,
        actions: `${base}/.well-known/actions.json`,
        data_sources: `${base}/.well-known/data-sources.json`,
        llms: `${base}/llms.txt`,
      },
      safety: {
        safe: ["search", "filter", "sort", "open detail", "compare", "read-only brief"],
        confirm: ["watchlist", "alerts", "exports", "Toolbox handoff", "paid x402 calls"],
        blocked: ["secret access", "arbitrary JavaScript", "destructive saved-state deletion"],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
