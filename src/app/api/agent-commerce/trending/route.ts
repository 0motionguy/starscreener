// GET /api/agent-commerce/trending
// Top N entries by composite score. Default N=10, max 50.

import { NextResponse, type NextRequest } from "next/server";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import {
  getAgentCommerceItems,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await refreshAgentCommerceFromStore();
  const raw = request.nextUrl.searchParams.get("limit");
  const parsed = Number.parseInt(raw ?? "10", 10);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(50, parsed) : 10;

  const items = getAgentCommerceItems()
    .slice()
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, limit);

  return NextResponse.json({ items }, { headers: READ_CACHE_HEADERS });
}
