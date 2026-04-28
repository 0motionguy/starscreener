// GET /api/repos/[owner]/[name]/events?limit=N
//
// Surfaces the per-repo GitHub Events firehose written by the Railway
// worker (apps/trendingrepo-worker/src/fetchers/github-events). Reads the
// `github-events:_index` slug first to validate the repo is in the
// watchlist (404 if not), then reads `github-events:<repoId>` for the
// actual event slice.
//
// Status codes:
//   200 — repo in watchlist + payload fresh, returns events
//   404 — repo not in the worker's polling watchlist
//   503 — repo in watchlist but no payload yet (fetcher still warming, or
//         every recent tick errored on this repo)
//
// Caller is expected to poll this endpoint at the worker cadence (5 min).
// We add a short `Cache-Control` header so a refresh storm during a
// page-spike doesn't fan out to Redis on every request.

import { NextRequest, NextResponse } from "next/server";

import {
  getGithubEventsRepoByFullName,
  readGithubEventsForRepo,
  refreshGithubEventsIndexFromStore,
  type NormalizedGithubEvent,
} from "@/lib/github-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// 30s edge cache + SWR — the worker polls every 5 min, so any consumer
// hitting us faster than that hits the cache, not Redis. SWR keeps the
// route warm even when traffic is bursty.
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
} as const;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json({ ok: false, error: "Invalid repo slug" }, { status: 400 });
  }

  const fullName = `${owner}/${name}`;
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  // Refresh the watchlist roster so a freshly-promoted repo becomes
  // queryable on the next tick boundary instead of after a Lambda cold-
  // start. The hook is rate-limited to 30s so this stays cheap.
  await refreshGithubEventsIndexFromStore();

  const entry = getGithubEventsRepoByFullName(fullName);
  if (!entry) {
    return NextResponse.json(
      {
        ok: false,
        error: "Repo not in github-events watchlist",
        fullName,
      },
      { status: 404, headers: CACHE_HEADERS },
    );
  }

  const result = await readGithubEventsForRepo(entry.repoId);
  if (!result.data) {
    return NextResponse.json(
      {
        ok: false,
        source: result.source,
        fullName,
        error: "No github-events payload yet for this repo (fetcher hasn't run or is failing)",
      },
      { status: 503, headers: CACHE_HEADERS },
    );
  }

  const events: NormalizedGithubEvent[] = (result.data.events ?? []).slice(0, limit);
  const ageSeconds = Math.round(result.ageMs / 1000);

  return NextResponse.json(
    {
      ok: true,
      source: result.source,
      fullName: result.data.fullName ?? fullName,
      writtenAt: result.writtenAt ?? null,
      ageSeconds,
      count: events.length,
      events,
    },
    { headers: CACHE_HEADERS },
  );
}
