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
import { backfillFromEvents } from "@/lib/pipeline/ingestion/events-backfill";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getGitHubTokenPool } from "@/lib/github-token-pool";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface RebuildBody {
  /** How many repos to process in this call. Default 20 (safe under 300s). */
  limit?: number;
  /** Start index into the candidate list; supports cursor pagination. */
  offset?: number;
  /** Max stargazer pages per repo (stargazer path only). Default 4. */
  maxPages?: number;
  /** Only rebuild repos without meaningful sparkline history. */
  skipSeeded?: boolean;
  /** Skip the recomputeAll at the end (call again with this=false once). */
  skipRecompute?: boolean;
  /** Process only these specific fullNames (overrides offset/limit/skipSeeded). */
  fullNames?: string[];
  /** If true, only process repos where stars > 40_000 (events-api fast path). */
  onlyMegaRepos?: boolean;
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

  // Pass empty string to the backfill helpers so they activate the
  // pool-aware path (`pool = token ? null : getGitHubTokenPool()`).
  // Pool emptiness is the operator-facing precondition now, not the
  // legacy single-token env var.
  if (getGitHubTokenPool().size() === 0) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "GitHub token pool is empty. Set GITHUB_TOKEN or GH_TOKEN_POOL — rebuild requires real tokens.",
      },
      { status: 500 },
    );
  }
  const token = "";

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
      : 20;
  const offset =
    typeof body.offset === "number" && body.offset >= 0
      ? Math.floor(body.offset)
      : 0;
  const maxPages =
    typeof body.maxPages === "number" && body.maxPages > 0 && body.maxPages <= 50
      ? Math.floor(body.maxPages)
      : 4;
  const skipSeeded = body.skipSeeded === true;
  const skipRecompute = body.skipRecompute === true;
  const onlyMegaRepos = body.onlyMegaRepos === true;
  const targetFullNames = Array.isArray(body.fullNames)
    ? body.fullNames.filter((s): s is string => typeof s === "string")
    : null;

  await pipeline.ensureReady();
  const stores = pipelineStores;

  // Pick candidates. Priority:
  //   1. explicit fullNames (targeted rebuild)
  //   2. onlyMegaRepos (>40k stars → events-api fast path)
  //   3. skipSeeded (only repos missing history)
  //   4. everything
  const all = repoStore.getAll();
  let pool = all;
  if (targetFullNames) {
    const wanted = new Set(targetFullNames);
    pool = all.filter((r) => wanted.has(r.fullName));
  } else if (onlyMegaRepos) {
    pool = all.filter((r) => r.stars > 40000);
  } else if (skipSeeded) {
    pool = all.filter((r) => {
      const spark = r.sparklineData ?? [];
      const unique = new Set(spark).size;
      return spark.length === 0 || unique <= 1;
    });
  }
  const candidates = pool.slice(offset, offset + limit);
  const totalInPool = pool.length;

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

      // Fallback for mega-repos (>40k stars) where the stargazer endpoint
      // hits GitHub's hard list cap. Use the Events API which works for
      // any repo size (trades depth for universality).
      if (result.skipped === "exceeds_list_cap") {
        const ev = await backfillFromEvents(repo.fullName, token, stores, {
          days: 30,
          maxPages: 3,
        });
        rateLimitRemaining = ev.rateLimitRemaining ?? rateLimitRemaining;
        backfilled += 1;
        details.push({
          fullName: repo.fullName,
          ok: true,
          snapshotsWritten: ev.snapshotsWritten,
          daysCovered: ev.daysCovered,
          ms: Date.now() - t0,
          reason: `events-api watch=${ev.watchEventsCounted}`,
          rateLimitRemaining,
        });
      } else if (result.skipped) {
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

  // Optional final recompute so scores/ranks/tags pick up the new snapshots.
  // Skip when paginating through a large rebuild — only recompute on the last
  // call.
  let recomputeResult: { reposRecomputed: number; scoresComputed: number } | null =
    null;
  if (!skipRecompute) {
    const r = await pipeline.recomputeAll();
    recomputeResult = {
      reposRecomputed: r.reposRecomputed,
      scoresComputed: r.scoresComputed,
    };
  }

  const nextOffset = offset + details.length;

  return NextResponse.json({
    ok: true,
    processed: details.length,
    totalCandidates: candidates.length,
    totalInPool,
    offset,
    nextOffset,
    hasMore: nextOffset < totalInPool,
    backfilled,
    skipped,
    failed,
    aborted,
    rateLimitRemaining,
    durationMs: Date.now() - startedAt,
    recompute: recomputeResult,
    details,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
