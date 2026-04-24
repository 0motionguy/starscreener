// POST /api/submissions/revenue — founder-submitted revenue intake.
// GET  /api/submissions/revenue — list recent submissions (public-safe fields
//                                 only; moderation gate means unapproved rows
//                                 reveal only "someone tried to claim X").
//
// Approved submissions become overlay rows (verified_trustmrr or
// self_reported tier) via /api/admin/revenue-queue. See
// src/lib/revenue-submissions.ts for the storage and validation layer.

import { NextRequest, NextResponse } from "next/server";

import {
  listRevenueSubmissions,
  submitRevenueToQueue,
  toPublicRevenueSubmission,
  validateRevenueSubmissionInput,
  type PublicRevenueSubmission,
  type RevenueSubmissionResult,
} from "@/lib/revenue-submissions";

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
