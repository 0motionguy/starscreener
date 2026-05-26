import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { enqueueDrop, peekQueueDepth } from "@/lib/repo-intake-queue";
import {
  computeSubmissionStats,
  listRepoSubmissions,
  submitRepoToQueue,
  summarizeRepoSubmissionQueue,
  toPublicRepoSubmission,
  validateRepoSubmissionInput,
  type PublicRepoSubmission,
  type RepoSubmissionQueueSummary,
  type RepoSubmissionResult,
  type RepoSubmissionStats,
} from "@/lib/repo-submissions";

export const runtime = "nodejs";

// Shape gate only — field-level validation (length limits, shareUrl host
// allow-list, repo normalization) lives in validateRepoSubmissionInput
// because it composes URL parsing helpers used by other call sites.
const RepoSubmissionsPostSchema = z.record(z.string(), z.unknown());

// Rate-limit anonymous submissions: each accepted POST LPUSHes onto the
// drop-intake queue which fans out to 31 signal touchpoints per repo. Budget is
// tighter than a pure-write endpoint so a single bad actor can't burn
// the GitHub PAT pool. (W5.5 HIGH — unauth + no rate-limit + GitHub-API burn.)
const SUBMISSIONS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

interface RepoSubmissionsListResponse {
  ok: true;
  queue: RepoSubmissionQueueSummary;
  queueDepth: number | null;
  stats: RepoSubmissionStats;
  submissions: PublicRepoSubmission[];
}

interface RepoSubmissionsCreateResponse {
  ok: true;
  result: RepoSubmissionResult;
  /** True when the producer successfully LPUSHed onto `queue:drop-a-repo`. */
  enqueued: boolean;
  /** Current LLEN after the push (null when Redis is unavailable). */
  queueDepth: number | null;
}

interface RepoSubmissionsErrorResponse {
  ok: false;
  error: string;
}

export async function GET(): Promise<
  NextResponse<RepoSubmissionsListResponse | RepoSubmissionsErrorResponse>
> {
  try {
    const [records, stats, queueDepth] = await Promise.all([
      listRepoSubmissions(),
      computeSubmissionStats(),
      peekQueueDepth(),
    ]);
    return NextResponse.json({
      ok: true,
      queue: summarizeRepoSubmissionQueue(records),
      queueDepth,
      stats,
      submissions: records.slice(0, 25).map(toPublicRepoSubmission),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<RepoSubmissionsCreateResponse | RepoSubmissionsErrorResponse>
> {
  const limit = await checkRateLimitAsync(request, {
    windowMs: HOUR_MS,
    maxRequests: SUBMISSIONS_PER_HOUR,
  });
  if (!limit.allowed) {
    const retryAfter = Math.ceil(limit.retryAfterMs / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: `rate limit exceeded — try again in ${retryAfter}s`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const parsedShape = await parseBody(request, RepoSubmissionsPostSchema);
  if (!parsedShape.ok) {
    return parsedShape.response as NextResponse<RepoSubmissionsErrorResponse>;
  }

  const parsed = validateRepoSubmissionInput(parsedShape.data);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const result = await submitRepoToQueue(parsed.value);

    // Only enqueue when a new submission was actually created — duplicates
    // and already-tracked repos return early before the LPUSH so we don't
    // burn worker cycles re-scanning the same repo.
    let enqueued = false;
    let queueDepth: number | null = null;
    if (result.kind === "created") {
      const enqueueResult = await enqueueDrop({
        submissionId: result.submission.id,
        fullName: result.submission.fullName,
        enqueuedAt: new Date().toISOString(),
        source: "web:repo-submissions",
      });
      enqueued = enqueueResult.ok;
      queueDepth = enqueueResult.queueDepth;
    }

    return NextResponse.json({ ok: true, result, enqueued, queueDepth });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("repo must be") ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
