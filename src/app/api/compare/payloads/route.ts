// /api/compare/payloads — return star-activity payloads for the given repos.
//
// Used by the redesigned /compare client to populate CompareChart with
// real history. Separate from /api/compare/github (which carries the
// commit-heatmap bundle); this one is just Redis lookups, so it's fast.

import { NextResponse, type NextRequest } from "next/server";

import { getDataStore } from "@/lib/data-store";
import type { StarActivityPayload } from "@/lib/star-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_REPOS = 5;

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace("/", "__")}`;
}

interface PayloadRow {
  fullName: string;
  payload: StarActivityPayload | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reposParam = searchParams.get("repos") ?? "";
  const repos = reposParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (repos.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing required 'repos' parameter", code: "missing_repos" },
      { status: 400 },
    );
  }
  if (repos.length > MAX_REPOS) {
    return NextResponse.json(
      {
        ok: false,
        error: `Maximum ${MAX_REPOS} repos per request`,
        code: "too_many_repos",
      },
      { status: 400 },
    );
  }
  for (const r of repos) {
    if (!FULL_NAME_RE.test(r)) {
      return NextResponse.json(
        { ok: false, error: `Invalid repo: ${r}`, code: "invalid_repo" },
        { status: 400 },
      );
    }
  }

  const store = getDataStore();
  const rows: PayloadRow[] = await Promise.all(
    repos.map(async (fullName): Promise<PayloadRow> => {
      try {
        const result = await store.read<StarActivityPayload>(
          payloadSlug(fullName),
        );
        return { fullName, payload: result.data };
      } catch {
        return { fullName, payload: null };
      }
    }),
  );

  return NextResponse.json(
    { ok: true, fetchedAt: new Date().toISOString(), rows },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
