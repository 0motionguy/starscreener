// GET /api/pipeline/sidebar-data
//
// One-shot bundle for the public sidebar shell plus exact-id watchlist
// hydration. By default the shell keeps `reposById` empty so the root layout
// and mobile drawer do not ship a momentum repo map before the client knows
// which watched ids are actually needed. `?ids=owner--repo` returns only a
// compact repo map. `?full=1` remains for backward compatibility.
//
// User-keyed overlay support has been REMOVED. Per-user data (e.g.
// `unreadAlerts`) now ships from `/api/pipeline/sidebar-overlay`, which
// uses Clerk's session and a private/no-store cache header. Requests
// arriving here with a `?userId` query param receive a 410 with a
// pointer to the new route. Single-release deprecation window.

import { NextRequest, NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/error-response";
import { READ_MEDIUM_HEADERS } from "@/lib/api/cache";
import {
  buildSidebarData,
  getSidebarReposByIds,
} from "@/lib/sidebar-data";

// Re-export the wire types so existing import paths keep working.
export type {
  SidebarDataRepo,
  SidebarDataResponse,
} from "@/lib/sidebar-data";

export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$/;
const MAX_ID_LOOKUP = 20;

function readRepoIds(params: URLSearchParams): string[] | null {
  if (!params.has("ids")) return null;
  const raw = params.get("ids");
  const ids = raw
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [];
  if (ids.length > MAX_ID_LOOKUP || ids.some((id) => !ID_RE.test(id))) {
    return [];
  }
  return Array.from(new Set(ids));
}

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

  const exactIds = readRepoIds(request.nextUrl.searchParams);
  if (exactIds) {
    if (exactIds.length === 0) {
      return NextResponse.json(
        errorEnvelope(
          `Invalid ids parameter. Pass 1-${MAX_ID_LOOKUP} repo ids like owner--name.`,
        ),
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        reposById: getSidebarReposByIds(exactIds),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...READ_MEDIUM_HEADERS,
        },
      },
    );
  }

  const trace = process.env.PERF_TRACE_ROUTES === "1";
  const startedAt = performance.now();
  try {
    const spans: Array<{ name: string; ms: number }> = [];
    const includeAllRepos = request.nextUrl.searchParams.get("full") === "1";
    // Keep the default repo map empty. Watchlist preview calls the exact-id
    // path after localStorage is available; legacy callers can opt into the
    // full map with `?full=1`.
    const data = await buildSidebarData({
      reposByIdTopN: includeAllRepos ? undefined : 0,
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
