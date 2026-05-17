import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { readEnv } from "@/lib/env-helpers";
import { runRepoIntakeForSubmission } from "@/lib/repo-intake";
import {
  listRepoSubmissions,
  submitRepoToQueue,
  summarizeRepoSubmissionQueue,
  toPublicRepoSubmission,
  validateRepoSubmissionInput,
  type PublicRepoSubmission,
  type RepoSubmissionQueueSummary,
  type RepoSubmissionResult,
} from "@/lib/repo-submissions";

export const runtime = "nodejs";

// Shape gate only — field-level validation (length limits, shareUrl host
// allow-list, repo normalization) lives in validateRepoSubmissionInput
// because it composes URL parsing helpers used by other call sites.
const RepoSubmissionsPostSchema = z.record(z.string(), z.unknown());

// Rate-limit anonymous submissions: each accepted POST can trigger a
// background GitHub intake job, so the budget is tighter than a pure-write
// endpoint. (W5.5 HIGH — unauth + no rate-limit + GitHub-API burn.)
const SUBMISSIONS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

interface RepoSubmissionsListResponse {
  ok: true;
  queue: RepoSubmissionQueueSummary;
  submissions: PublicRepoSubmission[];
}

interface RepoSubmissionsCreateResponse {
  ok: true;
  result: RepoSubmissionResult;
  intakeTriggered: boolean;
}

interface RepoSubmissionsErrorResponse {
  ok: false;
  error: string;
}

export async function GET(): Promise<
  NextResponse<RepoSubmissionsListResponse | RepoSubmissionsErrorResponse>
> {
  try {
    const records = await listRepoSubmissions();
    return NextResponse.json({
      ok: true,
      queue: summarizeRepoSubmissionQueue(records),
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
    const canTriggerIntake =
      process.env.NODE_ENV !== "production" ||
      verifyCronAuth(request).kind === "ok";
    const autoTriggerEnabled =
      readEnv("TRENDINGREPO_AUTO_INTAKE", "STARSCREENER_AUTO_INTAKE") !==
      "false";
    const triggerableSubmission =
      result.kind === "created" ||
      (result.kind === "duplicate" &&
        (result.submission.status === "pending" ||
          result.submission.status === "scan_failed"));

    const intakeTriggered =
      Boolean(triggerableSubmission && canTriggerIntake && autoTriggerEnabled);
    if (intakeTriggered && result.kind !== "already_tracked") {
      void runRepoIntakeForSubmission(result.submission.id).catch((err) => {
        console.error("[repo-intake] background trigger failed", err);
      });
    }

    return NextResponse.json({ ok: true, result, intakeTriggered });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("repo must be") ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
