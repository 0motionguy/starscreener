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
  const trace = process.env.PERF_TRACE_ROUTES === "1";
  const startedAt = performance.now();
  try {
    const spans: Array<{ name: string; ms: number }> = [];
    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
    const includeAllRepos = request.nextUrl.searchParams.get("full") === "1";
    // Cap by default to keep payload latency under control for mobile drawer
    // fetches. Clients that need the full map can opt in with `?full=1`.
    const data = await buildSidebarData({
      userId,
      reposByIdTopN: includeAllRepos ? undefined : 300,
      onTiming: (name, durationMs) => {
        if (trace) spans.push({ name, ms: durationMs });
      },
    });
    if (trace) {
      const totalMs = performance.now() - startedAt;
      console.info(
        `[perf][route:/api/pipeline/sidebar-data] totalMs=${totalMs.toFixed(1)} includeAllRepos=${includeAllRepos ? "1" : "0"} repos=${data.trendingReposCount} spans=${JSON.stringify(spans)}`,
      );
    }
    return NextResponse.json(data, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
