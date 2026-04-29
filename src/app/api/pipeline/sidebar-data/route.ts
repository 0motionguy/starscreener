// GET /api/pipeline/sidebar-data
//
// One-shot bundle for every piece of data the sidebar needs. Single
// source of truth lives in `@/lib/sidebar-data` so the desktop sidebar
// (rendered inside the root layout via `initialData`) and the mobile
// drawer (which fetches lazily on user-open through this endpoint) stay
// in sync.
//
// Query params:
//   userId  optional — when supplied, the response includes an
//           `unreadAlerts` count for that user.

import { NextRequest, NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/error-response";
import { buildSidebarData } from "@/lib/sidebar-data";

// Re-export the wire types so existing import paths keep working.
export type {
  SidebarDataRepo,
  SidebarDataResponse,
} from "@/lib/sidebar-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
    // No reposById cap on the API path: the mobile drawer (the only
    // remaining consumer post-B1) reads watchlist tiles and may target
    // repos outside the top-N momentum slice the layout passes inline.
    const data = await buildSidebarData({ userId });
    return NextResponse.json(data, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
