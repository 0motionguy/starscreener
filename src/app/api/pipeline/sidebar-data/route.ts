// GET /api/pipeline/sidebar-data
//
// One-shot bundle for the public sidebar shell (categories, source counts,
// language list, capped repo map, trending count). Single source of truth
// lives in `@/lib/sidebar-data` so the desktop sidebar (rendered inside
// the root layout via `initialShell`) and the mobile drawer (which fetches
// lazily on user-open through this endpoint) stay in sync.
//
// User-keyed overlay support has been REMOVED. Per-user data (e.g.
// `unreadAlerts`) now ships from `/api/pipeline/sidebar-overlay`, which
// uses Clerk's session and a private/no-store cache header. Requests
// arriving here with a `?userId` query param receive a 410 with a
// pointer to the new route. Single-release deprecation window.

import { NextRequest, NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/error-response";
import { READ_MEDIUM_HEADERS } from "@/lib/api/cache";
import { buildSidebarData } from "@/lib/sidebar-data";

// Re-export the wire types so existing import paths keep working.
export type {
  SidebarDataRepo,
  SidebarDataResponse,
} from "@/lib/sidebar-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("userId")) {
    return NextResponse.json(
      errorEnvelope(
        "User-keyed overlay support has moved to /api/pipeline/sidebar-overlay. " +
          "Drop the `?userId` query param here and call the overlay route for " +
          "per-user data. This deprecation will be removed in the next release.",
      ),
      { status: 410 },
    );
  }

  const trace = process.env.PERF_TRACE_ROUTES === "1";
  const startedAt = performance.now();
  try {
    const spans: Array<{ name: string; ms: number }> = [];
    const includeAllRepos = request.nextUrl.searchParams.get("full") === "1";
    // Cap by default to keep payload latency under control for mobile drawer
    // fetches. Clients that need the full map can opt in with `?full=1`.
    const data = await buildSidebarData({
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
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...READ_MEDIUM_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
