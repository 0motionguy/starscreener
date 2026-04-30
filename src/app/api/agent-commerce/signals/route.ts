// GET /api/agent-commerce/signals
// Aggregate signals across the corpus: protocol distribution, source mix,
// growth (new this week), top-composite leaderboard.

import { NextResponse } from "next/server";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import {
  getAgentCommerceItems,
  getAgentCommerceStats,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";

export const runtime = "nodejs";

export async function GET() {
  await refreshAgentCommerceFromStore();
  const items = getAgentCommerceItems();
  const stats = getAgentCommerceStats();

  const sourceCounts: Record<string, number> = {};
  for (const item of items) {
    for (const ref of item.sources) {
      sourceCounts[ref.source] = (sourceCounts[ref.source] ?? 0) + 1;
    }
  }

  const top = items
    .slice()
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, 10)
    .map(({ id, slug, name, kind, category, scores }) => ({
      id,
      slug,
      name,
      kind,
      category,
      composite: scores.composite,
    }));

  return NextResponse.json(
    {
      growth: {
        total: stats.totalItems,
        thisWeek: stats.thisWeekCount,
        portalReady: stats.portalReadyCount,
        x402Enabled: stats.x402EnabledCount,
        mcpServers: stats.mcpServerCount,
      },
      protocols: stats.byProtocol,
      sources: sourceCounts,
      top,
    },
    { headers: READ_CACHE_HEADERS },
  );
}
