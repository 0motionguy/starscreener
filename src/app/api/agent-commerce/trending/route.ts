// GET /api/agent-commerce/trending
// Top N entries by composite score. Default N=10, max 50.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import {
  getAgentCommerceItems,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";

export const runtime = "nodejs";
const QuerySchema = z.object({
  limit: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = QuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsedQuery.success) {
      return NextResponse.json(
        errorEnvelope("invalid query parameters", "INVALID_QUERY"),
        { status: 400 },
      );
    }
    await refreshAgentCommerceFromStore();
    const raw = request.nextUrl.searchParams.get("limit");
    const parsed = Number.parseInt(raw ?? "10", 10);
    const limit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(50, parsed) : 10;

    const items = getAgentCommerceItems()
      .slice()
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, limit);

    return NextResponse.json({ items }, { headers: READ_CACHE_HEADERS });
  } catch (error) {
    return serverError(error, {
      scope: "[api/agent-commerce/trending]",
      code: "AGENT_COMMERCE_TRENDING_FAILED",
    });
  }
}
