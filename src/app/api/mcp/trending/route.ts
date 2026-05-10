// Public read endpoint for the /mcp leaderboard.
// Kept separate from src/app/api/mcp/route.ts, which is the JSON-RPC MCP
// server endpoint.

import { NextRequest, NextResponse } from "next/server";
import { getMcpSignalData } from "@/lib/ecosystem-leaderboards";
import { READ_MEDIUM_HEADERS } from "@/lib/api/cache";
import { getDerivedRepos } from "@/lib/derived-repos";
import { rankMcpItems } from "@/lib/mcp-ranking";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_AFTER_SECONDS = 24 * 3600;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitParam)))
    : DEFAULT_LIMIT;
  const [data] = await Promise.all([
    getMcpSignalData(),
    refreshTrendingFromStore(),
  ]);
  const repoByFullName = new Map<string, Repo>();
  for (const repo of getDerivedRepos()) {
    repoByFullName.set(repo.fullName.toLowerCase(), repo);
  }
  const ranked = rankMcpItems(data.board.items, repoByFullName);
  const ageSeconds = Math.round(data.ageMs / 1000);
  const stale = ageSeconds > STALE_AFTER_SECONDS;

  return NextResponse.json(
    {
      ok: !stale,
      source: data.source,
      writtenAt: data.fetchedAt,
      ageSeconds,
      total: data.board.items.length,
      rankedTotal: ranked.length,
      returned: Math.min(limit, ranked.length),
      items: ranked.slice(0, limit).map(({ item }, index) => ({
        rank: index + 1,
        id: item.id,
        slug: item.id,
        title: item.title,
        url: item.url,
        author: item.author,
        registries: item.mcp?.sources ?? [],
        crossSourceCount: item.crossSourceCount,
        source: item.primaryRankSource ?? item.sourceLabel,
        sourceRanks: item.sourceRanks ?? [],
        metricLabel: item.sourceMetricLabel ?? item.popularityLabel,
        metricValue: item.sourceMetricValue ?? item.popularity,
        verified: item.verified,
        signalScore: item.signalScore,
      })),
    },
    { status: stale ? 503 : 200, headers: READ_MEDIUM_HEADERS },
  );
}
