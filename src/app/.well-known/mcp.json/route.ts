// GET /.well-known/mcp.json
//
// Discovery manifest for the trendingrepo.com MCP server. Following the
// IETF /.well-known convention (RFC 8615) so MCP-aware clients can probe a
// domain and locate the JSON-RPC endpoint without out-of-band setup.
//
// Sibling docs:
//   - /api/mcp           → the JSON-RPC POST endpoint
//   - /docs/mcp          → human-facing install instructions
//   - /.well-known/ai-discovery → the broader AI-agent discovery file
//
// SAM-06 / AGN-947.

import { NextResponse } from "next/server";

import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const runtime = "nodejs";
export const revalidate = 3600;

const RESPONSE_HEADERS = {
  // Cached at the edge for an hour — the manifest only changes on deploy.
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
  "Content-Type": "application/json",
} as const;

export function GET(): NextResponse {
  const body = {
    schemaVersion: "0.1" as const,
    name: "trendingrepo",
    title: SITE_NAME,
    description:
      "Live GitHub trend data — momentum scores, breakout detection, cross-platform mentions, and search across the trendingrepo.com index. Read-only.",
    homepage: absoluteUrl("/"),
    documentation: absoluteUrl("/docs/mcp"),
    contact: { url: "https://github.com/0motionguy/starscreener/issues" },
    transports: [
      {
        type: "http" as const,
        url: absoluteUrl("/api/mcp"),
        method: "POST" as const,
        contentType: "application/json",
      },
    ],
    tools: [
      {
        name: "get_trending",
        summary:
          "Top-momentum GitHub repos over a window (1h, 6h, 24h, 7d).",
      },
      {
        name: "get_repo",
        summary: "Full canonical profile for a single repo by owner + name.",
      },
      {
        name: "get_mentions",
        summary:
          "Cross-platform mention feed (reddit, hackernews, bluesky, twitter, devto, github) with cursor pagination.",
      },
      {
        name: "search_repos",
        summary:
          "Free-text search across the trendingrepo.com index, sorted by live momentum.",
      },
    ],
    capabilities: { tools: { listChanged: false } },
    license: "MIT",
  };
  return NextResponse.json(body, { status: 200, headers: RESPONSE_HEADERS });
}
