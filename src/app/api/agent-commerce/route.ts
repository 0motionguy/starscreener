// GET /api/agent-commerce
// Returns the full agent-commerce payload + stats. Supports query filters
// matching the page (tab, cat, protocol, pricing, portalready, q, limit, offset).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import {
  getAgentCommerceFile,
  getAgentCommerceItems,
  getAgentCommerceStats,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import {
  applyFilter,
  parseCategory,
  parsePortalReady,
  parsePricing,
  parseProtocols,
  parseSearchQuery,
  parseTab,
  type AgentCommerceFilter,
} from "@/lib/agent-commerce/extract";

export const runtime = "nodejs";

const MAX_LIMIT = 200;
const QuerySchema = z.object({
  tab: z.string().optional(),
  cat: z.string().optional(),
  protocol: z.string().optional(),
  pricing: z.string().optional(),
  portalready: z.string().optional(),
  q: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "60", 10);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(MAX_LIMIT, n);
}

function clampOffset(raw: string | null): number {
  const n = Number.parseInt(raw ?? "0", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        errorEnvelope("invalid query parameters", "INVALID_QUERY"),
        { status: 400 },
      );
    }
    await refreshAgentCommerceFromStore();
    const sp = request.nextUrl.searchParams;

    const filter: AgentCommerceFilter = {
      tab: parseTab(sp.get("tab")),
      category: parseCategory(sp.get("cat")),
      protocols: parseProtocols(sp.get("protocol")),
      pricing: parsePricing(sp.get("pricing")),
      portalReady: parsePortalReady(sp.get("portalready")),
      query: parseSearchQuery(sp.get("q")),
    };

    const limit = clampLimit(sp.get("limit"));
    const offset = clampOffset(sp.get("offset"));

    const all = getAgentCommerceItems();
    const filtered = applyFilter(all, filter);
    const sorted = filtered
      .slice()
      .sort((a, b) => b.scores.composite - a.scores.composite);
    const slice = sorted.slice(offset, offset + limit);

    const file = getAgentCommerceFile();

    return NextResponse.json(
      {
        fetchedAt: file.fetchedAt,
        source: file.source,
        windowDays: file.windowDays,
        total: filtered.length,
        offset,
        limit,
        stats: getAgentCommerceStats(),
        items: slice,
      },
      { headers: READ_CACHE_HEADERS },
    );
  } catch (error) {
    return serverError(error, {
      scope: "[api/agent-commerce]",
      code: "AGENT_COMMERCE_ROUTE_FAILED",
    });
  }
}
