// CACHE CONTRACT
// kind:        public (READ_SLOW_HEADERS)
// audience:    internal — called by /repo/[owner]/[name]/page.tsx for unknown repos
// freshness:   GitHub repo identity (description, stars, topics) churns slow; 5min/1h SWR is invisible
// invalidates: n/a (Vercel CDN expires per Cache-Control)
//
// Why this route exists:
//   Cold misses on /repo/[owner]/[name] used to block page TTFB on a full
//   GitHub API roundtrip. Extracting the live fetch into its own internal
//   API gives the upstream call its own CDN cache (independent of the page's
//   ISR cache) and lets us bound the GitHub roundtrip with a 1.5s timeout —
//   if GitHub is slow or rate-limited, the page falls through to notFound()
//   instead of stalling for 10+ seconds.

import { NextRequest, NextResponse } from "next/server";
import {
  fetchGitHubRepoLiveWithinBudget,
  LIVE_REPO_UPSTREAM_TIMEOUT_MS,
} from "@/lib/github-live";
import { READ_SLOW_HEADERS } from "@/lib/api/cache";
import { errorEnvelope } from "@/lib/api/error-response";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const name = url.searchParams.get("name");
  if (!owner || !name) {
    return NextResponse.json(
      errorEnvelope("missing owner or name", "BAD_REQUEST"),
      { status: 400 },
    );
  }

  try {
    const repo = await fetchGitHubRepoLiveWithinBudget(
      owner,
      name,
      LIVE_REPO_UPSTREAM_TIMEOUT_MS,
    );
    if (!repo) {
      return NextResponse.json(
        errorEnvelope("not found", "NOT_FOUND"),
        { status: 404, headers: READ_SLOW_HEADERS },
      );
    }
    return NextResponse.json(repo, { headers: READ_SLOW_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Aborted or 5xx from GitHub → 503 with the SWR window so we don't
    // hammer GitHub on every retry; the CDN serves stale-while-revalidate.
    return NextResponse.json(
      errorEnvelope(message, "GITHUB_LIVE_UNAVAILABLE"),
      { status: 503, headers: READ_SLOW_HEADERS },
    );
  }
}
