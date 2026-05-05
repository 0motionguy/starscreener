// POST /api/submissions/revenue — founder-submitted revenue intake.
// GET  /api/submissions/revenue — list recent submissions (public-safe fields
//                                 only; moderation gate means unapproved rows
//                                 reveal only "someone tried to claim X").
//
// Approved submissions become overlay rows (verified_trustmrr or
// self_reported tier) via /api/admin/revenue-queue. See
// src/lib/revenue-submissions.ts for the storage and validation layer.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { verifyTurnstileToken } from "@/lib/api/turnstile";
import {
  AuthFatalError,
  AuthQuarantineError,
  RateLimitRecoverableError,
  engineErrorTags,
} from "@/lib/errors";
import {
  listRevenueSubmissions,
  submitRevenueToQueue,
  toPublicRevenueSubmission,
  validateRevenueSubmissionInput,
  type PublicRevenueSubmission,
  type RevenueSubmissionResult,
} from "@/lib/revenue-submissions";

export const runtime = "nodejs";

// Shape gate only — field-level validation lives in validateRevenueSubmissionInput.
const RevenueSubmissionsPostSchema = z.record(z.string(), z.unknown());

interface RevenueSubmissionsListResponse {
  ok: true;
  submissions: PublicRevenueSubmission[];
}

interface RevenueSubmissionsCreateResponse {
  ok: true;
  result: RevenueSubmissionResult;
}

interface RevenueSubmissionsErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

const REVENUE_SUBMIT_RATE_LIMIT = { windowMs: 10 * 60_000, maxRequests: 6 } as const;

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
  NextResponse<RevenueSubmissionsListResponse | RevenueSubmissionsErrorResponse>
> {
  try {
    const records = await listRevenueSubmissions();
    return NextResponse.json({
      ok: true,
      submissions: records.slice(0, 25).map(toPublicRevenueSubmission),
    });
  } catch (err) {
    return serverError<RevenueSubmissionsErrorResponse>(err, {
      scope: "[api/submissions/revenue:GET]",
      publicMessage: "server error",
      code: "REVENUE_SUBMISSIONS_READ_FAILED",
      status: 500,
    });
  }
}

export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<
    RevenueSubmissionsCreateResponse | RevenueSubmissionsErrorResponse
  >
> {
  const rate = await checkRateLimitAsync(
    scopedByIp(request, "revenue-submissions"),
    REVENUE_SUBMIT_RATE_LIMIT,
  );
  if (!rate.allowed) {
    const err = new RateLimitRecoverableError("revenue submission denied: rate limited", {
      scope: "api/submissions/revenue",
    });
    Sentry.captureException(err, {
      tags: {
        ...engineErrorTags(err),
        abuse_surface: "revenue-submissions",
      },
    });
    return NextResponse.json(errorEnvelope("rate limited", "RATE_LIMITED"), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
    });
  }

  const parsedShape = await parseBody(request, RevenueSubmissionsPostSchema);
  if (!parsedShape.ok) {
    return parsedShape.response as NextResponse<RevenueSubmissionsErrorResponse>;
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
          abuse_surface: "revenue-submissions",
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

  const parsed = validateRevenueSubmissionInput(parsedShape.data);
  if (!parsed.ok) {
    return NextResponse.json(
      errorEnvelope(parsed.error, "INVALID_BODY"),
      { status: 400 },
    );
  }

  try {
    const result = await submitRevenueToQueue(parsed.value);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof AuthQuarantineError) {
      return NextResponse.json(
        errorEnvelope("turnstile verification failed", "TURNSTILE_REJECTED"),
        { status: 403 },
      );
    }
    const status =
      message.includes("repo must be") ||
      message.includes("Verified-profile slug")
        ? 400
        : 500;
    if (status === 400) {
      return NextResponse.json(errorEnvelope(message, "INVALID_BODY"), { status });
    }
    return serverError<RevenueSubmissionsErrorResponse>(err, {
      scope: "[api/submissions/revenue:POST]",
      publicMessage: "server error",
      code: "REVENUE_SUBMISSION_FAILED",
      status: 500,
    });
  }
}
