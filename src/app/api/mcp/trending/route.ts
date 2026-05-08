// GET /api/mcp/trending
// Public read endpoint for the ranked MCP leaderboard payload used by /mcp.

import { NextResponse, type NextRequest } from "next/server";

import { READ_MEDIUM_HEADERS } from "@/lib/api/cache";
import { getMcpSignalData } from "@/lib/ecosystem-leaderboards";
import { getDerivedRepos } from "@/lib/derived-repos";
import { rankMcpItems } from "@/lib/mcp-ranking";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 60;

function parseLimit(request: NextRequest, total: number): number {
  const raw = request.nextUrl.searchParams.get("limit");
  if (!raw) return total;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return total;
  return Math.min(parsed, total, 1000);
}

export async function GET(request: NextRequest) {
  const data = await getMcpSignalData();
  const items = data.board.items;
  const repos = getDerivedRepos();
  const repoByFullName = new Map<string, Repo>();
  for (const r of repos) {
    repoByFullName.set(r.fullName.toLowerCase(), r);
  }
  const ranked = rankMcpItems(items, repoByFullName);
  const limit = parseLimit(request, ranked.length);

  return NextResponse.json(
    {
      ok: true,
      fetchedAt: data.fetchedAt,
      source: data.source,
      ageMs: data.ageMs,
      total: items.length,
      rankedTotal: ranked.length,
      returned: limit,
      meta: {
        ...data.board.meta,
        rankedBy:
          "registry velocity, linked repo velocity, source rank, MCP domain scorer, momentum",
      },
      items: ranked.slice(0, limit).map((entry, index) => ({
        ...entry.item,
        rank: index + 1,
        trendRank: entry.trendRank,
        trendSource: entry.trendSource,
        trendLabel: entry.trendLabel,
        dataTier: entry.dataTier,
        hasDisplayData: entry.hasDisplayData,
      })),
    },
    { headers: READ_MEDIUM_HEADERS },
  );
}
