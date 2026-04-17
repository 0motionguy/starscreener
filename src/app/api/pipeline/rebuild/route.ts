// POST /api/pipeline/rebuild
//
// Full-data rebuild endpoint. Iterates EVERY repo currently in the store
// (or a subset via ?limit=), runs stargazer backfill to reconstruct 30-day
// history from real GitHub timestamps, then recomputes scores so the
// leaderboard reflects actual momentum instead of zero-delta defaults.
//
// This is the "give me real data NOW" path that goes beyond the snapshot
// cron (which only builds history forward, one point at a time).
//
// 100% real data:
//   - star history:   /repos/{owner}/{name}/stargazers?Accept=star+json
//                     (returns real starred_at timestamps per user)
//   - repo metadata:  live /repos/{owner}/{name} fetch
//   - scores:         recomputed from the reconstructed snapshot history
//
// No mocks. No synthesized values. Fails loudly on missing GITHUB_TOKEN.
//
// Auth: CRON_SECRET (Bearer).
//
// Body (optional JSON):
//   {
//     limit?: number       // max repos to process; default 50
//     maxPages?: number    // max stargazer pages per repo; default 8 (800 stars)
//     skipSeeded?: boolean // true = only process repos without sparkline history
//   }
//
// Response:
//   {
//     ok: true,
//     processed, skipped, backfilled, failed,
//     rateLimitRemaining,
//     durationMs,
//     details: [{ fullName, snapshotsWritten, ok, reason?, ms }]
//   }

import { NextRequest, NextResponse } from "next/server";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import { stores as pipelineStores } from "@/lib/pipeline/storage/singleton";
import { backfillStargazerHistory } from "@/lib/pipeline/ingestion/stargazer-backfill";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface RebuildBody {
  limit?: number;
  maxPages?: number;
  skipSeeded?: boolean;
}

interface PerRepoResult {
  fullName: string;
  ok: boolean;
  snapshotsWritten: number;
  daysCovered: number;
  ms: number;
  reason?: string;
  rateLimitRemaining?: number | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(req));
  if (deny) return deny;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "GITHUB_TOKEN not set. Rebuild requires a real token — no mock fallback.",
      },
      { status: 500 },
    );
  }

  let body: RebuildBody = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const parsed = (await req.json()) as unknown;
      if (parsed && typeof parsed === "object") body = parsed as RebuildBody;
    }
  } catch {
    // empty body OK
  }

  const limit =
    typeof body.limit === "number" && body.limit > 0 && body.limit <= 500
      ? Math.floor(body.limit)
      : 50;
  const maxPages =
    typeof body.maxPages === "number" && body.maxPages > 0 && body.maxPages <= 50
      ? Math.floor(body.maxPages)
      : 8;
  const skipSeeded = body.skipSeeded === true;

  await pipeline.ensureReady();
  const stores = pipelineStores;

  // Pick candidates: everything the store knows, optionally filtered to repos
  // that don't already have meaningful sparkline history.
  const all = repoStore.getAll();
  const candidates = (skipSeeded
    ? all.filter((r) => {
        const spark = r.sparklineData ?? [];
        const unique = new Set(spark).size;
        return spark.length === 0 || unique <= 1;
      })
    : all
  ).slice(0, limit);

  const startedAt = Date.now();
  const details: PerRepoResult[] = [];
  let backfilled = 0;
  let failed = 0;
  let skipped = 0;
  let rateLimitRemaining: number | null = null;
  let aborted = false;

  for (const repo of candidates) {
    const t0 = Date.now();
    try {
      const result = await backfillStargazerHistory(
        repo.fullName,
        token,
        stores,
        { maxPages },
      );
      rateLimitRemaining = result.rateLimitRemaining;
      if (result.skipped) {
        skipped += 1;
        details.push({
          fullName: repo.fullName,
          ok: true,
          snapshotsWritten: 0,
          daysCovered: 0,
          ms: Date.now() - t0,
          reason: result.skipped,
          rateLimitRemaining,
        });
      } else {
        backfilled += 1;
        details.push({
          fullName: repo.fullName,
          ok: true,
          snapshotsWritten: result.snapshotsWritten,
          daysCovered: result.daysCovered,
          ms: Date.now() - t0,
          rateLimitRemaining,
        });
      }

      // Guard the global GitHub budget — stop early so scheduled crons still
      // have headroom.
      if (
        rateLimitRemaining !== null &&
        rateLimitRemaining < 200 &&
        details.length < candidates.length
      ) {
        aborted = true;
        break;
      }
    } catch (err) {
      failed += 1;
      details.push({
        fullName: repo.fullName,
        ok: false,
        snapshotsWritten: 0,
        daysCovered: 0,
        ms: Date.now() - t0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Recompute so the fresh snapshots flow into scores + ranks + tags.
  const recompute = await pipeline.recomputeAll();

  return NextResponse.json({
    ok: true,
    processed: details.length,
    totalCandidates: candidates.length,
    backfilled,
    skipped,
    failed,
    aborted,
    rateLimitRemaining,
    durationMs: Date.now() - startedAt,
    recompute: {
      reposRecomputed: recompute.reposRecomputed,
      scoresComputed: recompute.scoresComputed,
    },
    details,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
