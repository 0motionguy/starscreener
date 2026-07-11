import { NextResponse } from "next/server";

import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  const base = SITE_URL.replace(/\/+$/, "");
  return NextResponse.json(
    {
      protocol_version: "2025-03-26",
      servers: [
        {
          name: "TrendingRepo MCP",
          transport: "http",
          url: `${base}/api/mcp`,
          auth: "public-read",
          tools: ["get_trending", "get_repo", "get_mentions", "search_repos"],
        },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
