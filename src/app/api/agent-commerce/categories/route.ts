// GET /api/agent-commerce/categories
// Taxonomy + counts for the filter UI.

import { NextResponse } from "next/server";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import {
  getAgentCommerceStats,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import {
  CATEGORIES,
  KINDS,
  PROTOCOLS,
} from "@/lib/agent-commerce/extract";

export const runtime = "nodejs";

export async function GET() {
  await refreshAgentCommerceFromStore();
  const stats = getAgentCommerceStats();

  return NextResponse.json(
    {
      kinds: KINDS.map((k) => ({ id: k, count: stats.byKind[k] ?? 0 })),
      categories: CATEGORIES.map((c) => ({
        id: c,
        count: stats.byCategory[c] ?? 0,
      })),
      protocols: PROTOCOLS.map((p) => ({
        id: p,
        count: stats.byProtocol[p] ?? 0,
      })),
      total: stats.totalItems,
    },
    { headers: READ_CACHE_HEADERS },
  );
}
