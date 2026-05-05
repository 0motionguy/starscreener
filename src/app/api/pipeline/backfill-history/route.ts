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
import { z } from "zod";
import { ensureSeededAsync } from "@/lib/pipeline/pipeline";
import { backfillStargazerHistory } from "@/lib/pipeline/ingestion/stargazer-backfill";
import { stores } from "@/lib/pipeline/storage/singleton";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { getGitHubTokenPool } from "@/lib/github-token-pool";
import { redactSensitiveText } from "@/lib/log-redaction";

export const runtime = "nodejs";

export const maxDuration = 300;

const FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const BackfillHistoryBodySchema = z.object({
  fullName: z
    .string()
    .trim()
    .regex(FULL_NAME_PATTERN, "fullName must be in the form 'owner/repo'"),
  maxPages: z.number().finite().positive().optional(),
});

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

  const parsed = await parseBody(request, BackfillHistoryBodySchema, {
    publicMessage: "fullName must be in the form 'owner/repo'",
  });
  if (!parsed.ok) return parsed.response as NextResponse<BackfillHistoryErrorResponse>;
  const { fullName, maxPages } = parsed.data;

  const maxPagesSafe =
    typeof maxPages === "number"
      ? Math.min(Math.floor(maxPages), 200)
      : undefined;

  // Empty string activates the pool-aware path inside the backfill helpers
  // (`pool = token ? null : getGitHubTokenPool()` at stargazer-backfill.ts:287).
  if (getGitHubTokenPool().size() === 0) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "GitHub token pool is empty — stargazer backfill requires a PAT (set GITHUB_TOKEN or GH_TOKEN_POOL).",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
  const token = "";

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
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message = redactSensitiveText(rawMessage);
    console.error("[pipeline:backfill-history] unexpected error", { message });
    return NextResponse.json(
      {
        ok: false,
        reason: "internal error",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
