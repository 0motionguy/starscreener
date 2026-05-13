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
import { z } from "zod";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";

export const runtime = "nodejs";

const MAX_PATHS_PER_REQUEST = 50;
const PATH_PATTERN = /^\/[A-Za-z0-9_\-./[\]]+$/;

const RevalidateBodySchema = z.object({
  paths: z
    .array(
      z
        .string()
        .regex(
          PATH_PATTERN,
          "path must start with / and use only [A-Za-z0-9_\\-./[\\]]",
        ),
    )
    .min(1, "paths must contain at least one entry")
    .max(
      MAX_PATHS_PER_REQUEST,
      `paths cap is ${MAX_PATHS_PER_REQUEST} per request`,
    ),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const parsed = await parseBody(request, RevalidateBodySchema);
  if (!parsed.ok) return parsed.response;
  const { paths } = parsed.data;

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
