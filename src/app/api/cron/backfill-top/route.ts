// GET/POST /api/cron/backfill-top
//
// Nightly stargazer-history backfill for the top N repos by momentum score.
// Runs sequentially so we honor the hourly GitHub rate limit, and the
// backfill module itself aborts per-repo when remaining < 200. Protected by
// CRON_SECRET.
//
// Query params:
//   n = how many top repos to backfill (default 20, max 100)
//
// Response:
//   { ok: true, processed, okCount, failed, results, durationMs }

import { NextRequest, NextResponse } from "next/server";
import { ensureSeededAsync } from "@/lib/pipeline/pipeline";
import { backfillStargazerHistory } from "@/lib/pipeline/ingestion/stargazer-backfill";
import {
  repoStore,
  scoreStore,
  stores,
} from "@/lib/pipeline/storage/singleton";

export const runtime = "nodejs";
export const maxDuration = 300;

interface PerRepoOutcome {
  fullName: string;
  ok: boolean;
  snapshotsWritten: number;
  daysCovered: number;
  rateLimitRemaining: number | null;
  skipped: string | null;
  error: string | null;
}

export interface CronBackfillTopResponse {
  ok: true;
  processed: number;
  okCount: number;
  failed: number;
  stoppedEarly: boolean;
  rateLimitRemaining: number | null;
  results: PerRepoOutcome[];
  durationMs: number;
}

export interface CronBackfillTopErrorResponse {
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

async function handleBackfillTop(
  request: NextRequest,
): Promise<
  NextResponse<CronBackfillTopResponse | CronBackfillTopErrorResponse>
> {
  const startedAt = Date.now();

  if (!verifyAuth(request)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "GITHUB_TOKEN is not set — stargazer backfill requires a PAT with public_repo scope",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  const { searchParams } = request.nextUrl;
  const nRaw = Number(searchParams.get("n"));
  const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(Math.floor(nRaw), 100) : 20;

  try {
    await ensureSeededAsync();

    // Pick top N repos by momentum score (highest overall first). Scores
    // that reflect breakout acceleration already bake in the breakoutMultiplier,
    // so sorting by overall is equivalent to sorting by "breakout strength"
    // without needing a separate breakoutScore field.
    const scores = scoreStore
      .getAll()
      .slice()
      .sort((a, b) => b.overall - a.overall)
      .slice(0, n);

    const results: PerRepoOutcome[] = [];
    let okCount = 0;
    let failed = 0;
    let stoppedEarly = false;
    let rateLimitRemaining: number | null = null;

    for (const score of scores) {
      const repo = repoStore.get(score.repoId);
      if (!repo) {
        results.push({
          fullName: score.repoId,
          ok: false,
          snapshotsWritten: 0,
          daysCovered: 0,
          rateLimitRemaining,
          skipped: null,
          error: "repo not in store",
        });
        failed += 1;
        continue;
      }

      try {
        const outcome = await backfillStargazerHistory(
          repo.fullName,
          token,
          stores,
        );
        rateLimitRemaining = outcome.rateLimitRemaining;
        results.push({
          fullName: repo.fullName,
          ok: true,
          snapshotsWritten: outcome.snapshotsWritten,
          daysCovered: outcome.daysCovered,
          rateLimitRemaining,
          skipped: outcome.skipped ?? null,
          error: null,
        });
        okCount += 1;

        // If the backfill aborted under the 200-remaining floor, stop
        // altogether — next run will resume with a fresh quota.
        if (rateLimitRemaining !== null && rateLimitRemaining < 200) {
          stoppedEarly = true;
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[cron:backfill-top] ${repo.fullName} failed`,
          err,
        );
        results.push({
          fullName: repo.fullName,
          ok: false,
          snapshotsWritten: 0,
          daysCovered: 0,
          rateLimitRemaining,
          skipped: null,
          error: message,
        });
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      okCount,
      failed,
      stoppedEarly,
      rateLimitRemaining,
      results,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron:backfill-top] unexpected error", err);
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
): Promise<
  NextResponse<CronBackfillTopResponse | CronBackfillTopErrorResponse>
> {
  return handleBackfillTop(request);
}

export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<CronBackfillTopResponse | CronBackfillTopErrorResponse>
> {
  return handleBackfillTop(request);
}
