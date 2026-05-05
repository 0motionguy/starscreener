import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { verifyCronAuth } from "@/lib/api/auth";
import { enforceMutationSameOrigin } from "@/lib/api/mutation-origin-guard";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { parseBody } from "@/lib/api/parse-body";
import { verifyTurnstileToken } from "@/lib/api/turnstile";
import { readEnv } from "@/lib/env-helpers";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import {
  AuthFatalError,
  AuthQuarantineError,
  RateLimitRecoverableError,
  engineErrorTags,
} from "@/lib/errors";
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
  code?: string;
}

const REPO_SUBMIT_RATE_LIMIT = { windowMs: 10 * 60_000, maxRequests: 8 } as const;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

function scopedByIp(request: NextRequest, scope: string): Request {
  const ip = getClientIp(request);
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-for", `${scope}|${ip}`);
  return new Request(request.url, { method: request.method, headers });
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
    return serverError<RepoSubmissionsErrorResponse>(err, {
      scope: "[api/repo-submissions:GET]",
      publicMessage: "server error",
      code: "REPO_SUBMISSIONS_READ_FAILED",
      status: 500,
    });
  }
}

export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<RepoSubmissionsCreateResponse | RepoSubmissionsErrorResponse>
> {
  const guard = enforceMutationSameOrigin(request);
  if (!guard.ok) return guard.response as NextResponse<RepoSubmissionsErrorResponse>;

  const rate = await checkRateLimitAsync(
    scopedByIp(request, "repo-submissions"),
    REPO_SUBMIT_RATE_LIMIT,
  );
  if (!rate.allowed) {
    const err = new RateLimitRecoverableError("repo submission denied: rate limited", {
      scope: "api/repo-submissions",
    });
    Sentry.captureException(err, {
      tags: {
        ...engineErrorTags(err),
        abuse_surface: "repo-submissions",
      },
    });
    return NextResponse.json(
      errorEnvelope("rate limited", "RATE_LIMITED"),
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  const parsedShape = await parseBody(request, RepoSubmissionsPostSchema);
  if (!parsedShape.ok) {
    return parsedShape.response as NextResponse<RepoSubmissionsErrorResponse>;
  }

  const remoteIp = getClientIp(request);
  const token =
    typeof parsedShape.data["turnstileToken"] === "string"
      ? parsedShape.data["turnstileToken"]
      : null;
  const turnstile = await verifyTurnstileToken(token, remoteIp).catch((err) => {
    if (err instanceof AuthQuarantineError || err instanceof AuthFatalError) {
      Sentry.captureException(err, {
        tags: {
          ...engineErrorTags(err),
          abuse_surface: "repo-submissions",
        },
      });
    }
    throw err;
  });
  if (!turnstile.ok) {
    const status = turnstile.reason === "not_configured" ? 503 : 403;
    const code =
      turnstile.reason === "not_configured"
        ? "TURNSTILE_NOT_CONFIGURED"
        : "TURNSTILE_REQUIRED";
    const message =
      turnstile.reason === "not_configured"
        ? "submission protection is not configured"
        : "turnstile verification required";
    return NextResponse.json(errorEnvelope(message, code), { status });
  }

  const parsed = validateRepoSubmissionInput(parsedShape.data);
  if (!parsed.ok) {
    return NextResponse.json(
      errorEnvelope(parsed.error, "INVALID_BODY"),
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
    if (err instanceof AuthQuarantineError) {
      return NextResponse.json(
        errorEnvelope("turnstile verification failed", "TURNSTILE_REJECTED"),
        { status: 403 },
      );
    }
    if (message.includes("repo must be")) {
      return NextResponse.json(errorEnvelope(message, "INVALID_REPO"), { status: 400 });
    }
    return serverError<RepoSubmissionsErrorResponse>(err, {
      scope: "[api/repo-submissions:POST]",
      publicMessage: "server error",
      code: "REPO_SUBMISSION_FAILED",
      status: 500,
    });
  }
}
