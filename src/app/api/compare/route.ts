// StarScreener — `/api/compare` route.
//
// Fetches a rich per-repo bundle directly from the GitHub REST API for the
// Compare page rewrite. Up to 4 repos per request. Bundles are fetched in
// parallel; individual failures (404 / rate-limit) are encoded in the bundle
// as `ok:false` rather than surfacing as a batch error.
//
// Response is cached at the edge for an hour with stale-while-revalidate for
// six hours — the underlying GitHub data does not move that fast and caching
// shields our rate limit.

import { NextRequest, NextResponse } from "next/server";
import {
  fetchCompareBundles,
  type CompareRepoBundle,
} from "@/lib/github-compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_REPOS = 4;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const reposParam = searchParams.get("repos") ?? "";

  const requested = reposParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return NextResponse.json(
      { error: "Missing required 'repos' parameter (comma-separated owner/name)" },
      { status: 400 },
    );
  }

  if (requested.length > MAX_REPOS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_REPOS} repos per request` },
      { status: 400 },
    );
  }

  const invalid = requested.filter((n) => !FULL_NAME_RE.test(n));
  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid repo name(s): ${invalid.join(", ")} (expected 'owner/name')`,
      },
      { status: 400 },
    );
  }

  // De-duplicate while preserving order so `bundles[i]` still lines up with
  // the caller's intent.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const n of requested) {
    if (!seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  }

  const bundles: CompareRepoBundle[] = await fetchCompareBundles(names, {
    token: process.env.GITHUB_TOKEN,
  });

  const body = {
    bundles,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
