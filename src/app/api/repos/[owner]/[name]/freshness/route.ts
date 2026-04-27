// GET /api/repos/[owner]/[name]/freshness
//
// Exposes per-source scanner freshness so the repo detail UI can render
// chips like "reddit 2h · hn 4h · bluesky 3d". See design note in
// src/lib/source-health.ts — freshness is keyed by source (global), not
// by (source, repo), because every scraper ingests a firehose and buckets
// per-repo post-hoc. The owner/name in the URL is validated and used for
// cache-key shape, not per-repo differentiation.

import { NextRequest, NextResponse } from "next/server";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { getFreshnessSnapshot } from "@/lib/source-health";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

const FRESHNESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(errorEnvelope("Invalid repo slug"), { status: 400 });
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    return NextResponse.json(errorEnvelope("Repo not found"), { status: 404 });
  }

  const snapshot = getFreshnessSnapshot();

  return NextResponse.json(
    {
      ok: true,
      fetchedAt: snapshot.fetchedAt,
      sources: snapshot.sources,
    },
    { headers: FRESHNESS_CACHE_HEADERS },
  );
}
