// POST /api/revalidate
//
// Operational tool to flush stuck ISR cache entries for specific paths.
// Gated by CRON_SECRET via the same verifyCronAuth helper every cron route
// uses; no public access.
//
// Why this exists: Vercel ISR (revalidate=300) caches both 2xx AND 5xx
// responses with stale-while-revalidate=31535700 (≈1 year). When a build-time
// or first-render failure caches a 500 page, the SWR background refresh
// sometimes also fails (rate-limit, transient upstream) — leaving the route
// stuck at 500 even after the underlying code bug is fixed and redeployed.
//
// Discovered 2026-05-13: 5 of 7 sampled /repo/[owner]/[name] routes stuck
// at 500 on production despite the latest deployment's deploy URL serving
// the same routes 200. `curl -H "Cache-Control: no-cache"` flushed 2 of 5;
// the other 3 stayed stuck. This endpoint gives ops a programmatic flush.
//
// Body shape:
//   { paths: ["/repo/sst/sst", "/repo/sindresorhus/ky"] }
//
// Response:
//   { ok: true, revalidated: ["/repo/sst/sst", "/repo/sindresorhus/ky"] }
//
// Caller is responsible for verifying the route returns 200 after the flush
// (the underlying code bug may also need fixing). This endpoint only flushes
// the cache.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";

export const runtime = "nodejs";

const MAX_PATHS_PER_REQUEST = 50;
const PATH_PATTERN = /^\/[A-Za-z0-9_\-./[\]]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const verdict = verifyCronAuth(request);
  if (verdict.kind !== "ok") {
    return authFailureResponse(verdict);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  const raw = (body as { paths?: unknown }).paths;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { ok: false, error: "paths must be a non-empty array" },
      { status: 400 },
    );
  }
  if (raw.length === 0) {
    return NextResponse.json(
      { ok: false, error: "paths must contain at least one entry" },
      { status: 400 },
    );
  }
  if (raw.length > MAX_PATHS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `paths cap is ${MAX_PATHS_PER_REQUEST} per request` },
      { status: 400 },
    );
  }

  const paths: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return NextResponse.json(
        { ok: false, error: "every path entry must be a string" },
        { status: 400 },
      );
    }
    if (!PATH_PATTERN.test(entry)) {
      return NextResponse.json(
        {
          ok: false,
          error: `invalid path: ${entry} — must start with / and use only [A-Za-z0-9_\\-./[\\]]`,
        },
        { status: 400 },
      );
    }
    paths.push(entry);
  }

  const revalidated: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  for (const path of paths) {
    try {
      revalidatePath(path);
      revalidated.push(path);
    } catch (err) {
      errors.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      revalidated,
      errors,
      requestedAt: new Date().toISOString(),
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
