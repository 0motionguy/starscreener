// POST /api/submissions/revenue — founder-submitted revenue intake.
// GET  /api/submissions/revenue — list recent submissions (public-safe fields
//                                 only; moderation gate means unapproved rows
//                                 reveal only "someone tried to claim X").
//
// Approved submissions become overlay rows (verified_trustmrr or
// self_reported tier) via /api/admin/revenue-queue. See
// src/lib/revenue-submissions.ts for the storage and validation layer.

import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  listRevenueSubmissions,
  submitRevenueToQueue,
  toPublicRevenueSubmission,
  validateRevenueSubmissionInput,
  type PublicRevenueSubmission,
  type RevenueSubmissionResult,
} from "@/lib/revenue-submissions";

// Public POST — founders submit revenue claims. Tighter cap than repo
// submissions (3 per 10 min per IP) because each submission also creates a
// downstream moderation task. CRON-authenticated callers bypass.
const REVENUE_SUBMISSION_RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxRequests: 3 } as const;

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
  NextResponse<
    RevenueSubmissionsCreateResponse | RevenueSubmissionsErrorResponse
  >
> {
  const cronAuth = verifyCronAuth(request);
  if (cronAuth.kind !== "ok") {
    const rl = await checkRateLimitAsync(request, REVENUE_SUBMISSION_RATE_LIMIT);
    if (!rl.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(rl.retryAfterMs / 1000));
      return NextResponse.json(
        {
          ok: false,
          error: `Rate limited — ${REVENUE_SUBMISSION_RATE_LIMIT.maxRequests} submissions per ${REVENUE_SUBMISSION_RATE_LIMIT.windowMs / 60000}min per IP. Retry after ${retryAfterSec}s.`,
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

  const parsed = validateRevenueSubmissionInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const result = await submitRevenueToQueue(parsed.value);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message.includes("repo must be") ||
      message.includes("Verified-profile slug")
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
