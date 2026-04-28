// POST /api/pipeline/backfill-history
//
// On-demand historical stargazer backfill for a single repo. Walks the
// GitHub `/stargazers` endpoint with the star+json accept header, buckets
// starred_at timestamps into daily counts, and writes 30 backdated
// RepoSnapshots so the delta engine has real history to work with.
//
// Protected by CRON_SECRET — this is an operator action, not a user action.
//
// Body:
//   { "fullName": "owner/repo", "maxPages"?: number }
//
// Response:
//   { ok: true, fullName, snapshotsWritten, daysCovered, rateLimitRemaining,
//     durationMs }

import { NextRequest, NextResponse } from "next/server";
import { ensureSeededAsync } from "@/lib/pipeline/pipeline";
import { backfillStargazerHistory } from "@/lib/pipeline/ingestion/stargazer-backfill";
import { stores } from "@/lib/pipeline/storage/singleton";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";

export const runtime = "nodejs";

export const maxDuration = 300;

const FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export interface BackfillHistoryResponse {
  ok: true;
  fullName: string;
  snapshotsWritten: number;
  daysCovered: number;
  rateLimitRemaining: number | null;
  skipped: string | null;
  durationMs: number;
}

export interface BackfillHistoryErrorResponse {
  ok: false;
  reason: string;
  durationMs?: number;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<BackfillHistoryResponse | BackfillHistoryErrorResponse>> {
  const startedAt = Date.now();

  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<BackfillHistoryErrorResponse>;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { ok: false, reason: "body must be an object" },
      { status: 400 },
    );
  }
  const { fullName, maxPages } = body as {
    fullName?: unknown;
    maxPages?: unknown;
  };

  if (typeof fullName !== "string" || !FULL_NAME_PATTERN.test(fullName)) {
    return NextResponse.json(
      { ok: false, reason: "fullName must be in the form 'owner/repo'" },
      { status: 400 },
    );
  }

  const maxPagesSafe =
    typeof maxPages === "number" && Number.isFinite(maxPages) && maxPages > 0
      ? Math.min(Math.floor(maxPages), 200)
      : undefined;

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

  try {
    await ensureSeededAsync();
    const result = await backfillStargazerHistory(fullName, token, stores, {
      maxPages: maxPagesSafe,
    });

    return NextResponse.json({
      ok: true,
      fullName,
      snapshotsWritten: result.snapshotsWritten,
      daysCovered: result.daysCovered,
      rateLimitRemaining: result.rateLimitRemaining,
      skipped: result.skipped ?? null,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pipeline:backfill-history] unexpected error", err);
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
