import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
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

// Public POST surface — anyone can submit a repo, but a per-IP fixed window
// caps spam: 5 submissions per 10 minutes. Backed by Upstash when configured
// so the cap holds across Vercel Lambdas, memory fallback in dev. Rejects with
// 429 + Retry-After. CRON_SECRET-authenticated callers bypass via the same
// auto-trigger gate downstream — they're trusted to batch submit.
const SUBMISSION_RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxRequests: 5 } as const;

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
  // Rate-limit BEFORE parsing the body so a flood of malformed JSON can't
  // bypass the cap. Skip the check for trusted CRON callers (operator
  // batch submissions).
  const cronAuth = verifyCronAuth(request);
  if (cronAuth.kind !== "ok") {
    const rl = await checkRateLimitAsync(request, SUBMISSION_RATE_LIMIT);
    if (!rl.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(rl.retryAfterMs / 1000));
      return NextResponse.json(
        {
          ok: false,
          error: `Rate limited — ${SUBMISSION_RATE_LIMIT.maxRequests} submissions per ${SUBMISSION_RATE_LIMIT.windowMs / 60000}min per IP. Retry after ${retryAfterSec}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = validateRepoSubmissionInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const result = await submitRepoToQueue(parsed.value);
    const canTriggerIntake =
      process.env.NODE_ENV !== "production" || cronAuth.kind === "ok";
    const autoTriggerEnabled =
      process.env.STARSCREENER_AUTO_INTAKE !== "false";
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
