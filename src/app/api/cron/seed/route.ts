// GET/POST /api/cron/seed
//
// Live-seeds a fresh deploy from the curated SEED_REPOS list via the REAL
// GitHub API. Protected by CRON_SECRET. Intended to be called manually once
// after a fresh deployment, or via cron when expanding coverage in chunks:
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     "https://your-host/api/cron/seed?categories=ai-ml,devtools"
//
// Query params:
//   categories = comma-separated SEED_REPOS keys (optional)
//   limit      = hard cap on repos ingested this call (optional)
//
// Response:
//   { ok: true, reposIngested, snapshotsAdded, failed, rateLimitRemaining,
//     durationMs, categories, limit }

import { NextRequest, NextResponse } from "next/server";
import { pipeline, ensureSeededAsync } from "@/lib/pipeline/pipeline";
import { seedPipelineLive } from "@/lib/pipeline/ingestion/seed";
import { stores } from "@/lib/pipeline/storage/singleton";

export const runtime = "nodejs";
export const maxDuration = 300;

export interface CronSeedResponse {
  ok: true;
  reposIngested: number;
  snapshotsAdded: number;
  failed: number;
  rateLimitRemaining: number | null;
  durationMs: number;
  categories: string[] | null;
  limit: number | null;
}

export interface CronSeedErrorResponse {
  ok: false;
  reason: string;
  durationMs?: number;
}

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const trimmed = header.trim();
  if (trimmed === secret) return true;
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice("Bearer ".length) === secret;
  }
  return false;
}

async function handleCronSeed(
  request: NextRequest,
): Promise<NextResponse<CronSeedResponse | CronSeedErrorResponse>> {
  const startedAt = Date.now();

  if (!verifyAuth(request)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    await ensureSeededAsync();

    const { searchParams } = request.nextUrl;
    const categoriesRaw = searchParams.get("categories");
    const categories = categoriesRaw
      ? categoriesRaw
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      : undefined;

    const limitRaw = searchParams.get("limit");
    const parsedLimit = limitRaw !== null ? Number(limitRaw) : NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : undefined;

    const summary = await seedPipelineLive(stores, {
      categories,
      limit,
    });

    // Recompute once so derived stores (scores/ranks/reasons) reflect the
    // newly-ingested repos before the next UI read.
    await pipeline.recomputeAll();

    return NextResponse.json({
      ok: true,
      reposIngested: summary.reposIngested,
      snapshotsAdded: summary.snapshotsAdded,
      failed: summary.failed,
      rateLimitRemaining: summary.rateLimitRemaining,
      durationMs: Date.now() - startedAt,
      categories: categories ?? null,
      limit: limit ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron:seed] unexpected error", err);
    return NextResponse.json(
      {
        ok: false,
        reason: `internal error: ${message}`,
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<CronSeedResponse | CronSeedErrorResponse>> {
  return handleCronSeed(request);
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CronSeedResponse | CronSeedErrorResponse>> {
  return handleCronSeed(request);
}
