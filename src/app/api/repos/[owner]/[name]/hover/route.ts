// GET /api/repos/[owner]/[name]/hover
//
// Slim per-repo summary intended for hover previews. The full canonical
// profile endpoint at /api/repos/[owner]/[name]?v=2 is ~30KB; this endpoint
// is ~500B — just the fields a hover card needs to render. Aggressively
// cached (5min fresh + 1h stale) because hover-card data is presentational
// and doesn't need real-time freshness.
//
// Shape:
//   { ok: true, repo: { fullName, owner, name, ownerAvatarUrl, description,
//                       language, stars, starsDelta7d, trendScore7d,
//                       categoryId } }
//
// Error envelope mirrors the canonical endpoint:
//   { ok: false, error: string, code?: string }
//   400 invalid_slug · 404 repo_not_found · 500 internal_error

import { NextRequest, NextResponse } from "next/server";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRecentReposFromStore } from "@/lib/recent-repos";
import { READ_SLOW_HEADERS } from "@/lib/api/cache";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

function errorResponse(
  error: string,
  status: number,
  code?: string,
): NextResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = code
    ? { ok: false, error, code }
    : { ok: false, error };
  return NextResponse.json(body, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return errorResponse("Invalid repo slug", 400, "invalid_slug");
  }

  try {
    await Promise.all([
      refreshTrendingFromStore(),
      refreshRecentReposFromStore(),
      refreshRepoMetadataFromStore(),
    ]);

    const repo = getDerivedRepoByFullName(`${owner}/${name}`);
    if (!repo) {
      return errorResponse("Repo not found", 404, "repo_not_found");
    }

    return NextResponse.json(
      {
        ok: true,
        repo: {
          fullName: repo.fullName,
          owner: repo.owner,
          name: repo.name,
          ownerAvatarUrl: repo.ownerAvatarUrl,
          description: repo.description,
          language: repo.language,
          stars: repo.stars,
          starsDelta7d: repo.starsDelta7d,
          trendScore7d: repo.trendScore7d ?? null,
          categoryId: repo.categoryId,
        },
      },
      { headers: READ_SLOW_HEADERS },
    );
  } catch (err) {
    console.error(`[api:repo:hover] build failed for ${owner}/${name}`, err);
    return errorResponse("Internal error", 500, "internal_error");
  }
}
