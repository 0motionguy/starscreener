// StarScreener — `/api/compare/github` (GitHub-only extras).
//
// Thin wrapper over `fetchCompareBundles`, exposing the rich GitHub bundle
// (commit heatmap, contributors, languages, PR/issue churn, releases) that
// powers the legacy Compare "Code activity side-by-side" section rendered
// under the canonical profile grid at `/compare`.
//
// The canonical compare lives at `/api/compare`; this route is intentionally
// separate because the GitHub bundle is expensive (≈12 API calls per 4-repo
// request, plus occasional `stats/commit_activity` retries) and slow-moving,
// so we cache it far more aggressively (5 min edge / 1 h SWR).
//
// Query contract:
//   - `?repos=owner/name,owner/name,...`
//
// Response shape:
//   { ok: true, fetchedAt: ISO, bundles: CompareRepoBundle[] }
//
// Errors:
//   - 400 "missing_repos"   — no repos provided
//   - 400 "too_many_repos"  — more than MAX_REPOS
//   - 500 "internal_error"  — unexpected throw escaping `fetchCompareBundles`
//     (individual-repo failures are absorbed into `ok:false` bundles, so this
//     is reserved for catastrophic failures of the batch itself)

import { NextRequest, NextResponse } from "next/server";
import {
  fetchCompareBundles,
  type CompareRepoBundle,
} from "@/lib/github-compare";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const MAX_REPOS = 5;

interface CompareGithubOkBody {
  ok: true;
  fetchedAt: string;
  bundles: CompareRepoBundle[];
}

interface CompareGithubErrBody {
  ok: false;
  error: string;
  code: string;
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<CompareGithubErrBody> {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function GET(request: NextRequest) {
  // Use `new URL(request.url)` rather than `request.nextUrl` so the handler
  // stays testable with a plain `Request` (mirrors the canonical route tests).
  const { searchParams } = new URL(request.url);
  const reposParam = searchParams.get("repos") ?? "";

  const repos = reposParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (repos.length === 0) {
    return errorResponse(
      "missing_repos",
      "Missing required 'repos' parameter",
      400,
    );
  }

  if (repos.length > MAX_REPOS) {
    return errorResponse(
      "too_many_repos",
      `Maximum ${MAX_REPOS} repos per request`,
      400,
    );
  }

  try {
    const bundles = await fetchCompareBundles(repos);
    const body: CompareGithubOkBody = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      bundles,
    };
    return NextResponse.json(body, {
      status: 200,
      headers: {
        // commit_activity is expensive + slow-changing; lean on the edge cache.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[api:compare/github] unexpected failure", err);
    return errorResponse("internal_error", "Internal error", 500);
  }
}
