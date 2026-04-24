// Admin moderation endpoint for revenue submissions.
//
// GET  — list all submissions (pending + history). Requires CRON_SECRET bearer.
// POST — { id: string, action: "approve" | "reject", moderationNote?: string }
//        flips status in the JSONL. Approved rows are picked up by
//        src/lib/revenue-overlays.ts's self-reported / trustmrr-link loaders
//        on the next read.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import {
  listRevenueSubmissions,
  toPublicRevenueSubmission,
  updateRevenueSubmissionStatus,
  type RevenueSubmissionRecord,
} from "@/lib/revenue-submissions";

interface AdminSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  mode: RevenueSubmissionRecord["mode"];
  status: RevenueSubmissionRecord["status"];
  submittedAt: string;
  moderatedAt: string | null;
  moderationNote: string | null;
  contact: string | null;
  notes: string | null;
  trustmrrSlug?: string;
  mrrCents?: number;
  customers?: number | null;
  paymentProvider?: string;
  proofUrl?: string | null;
}

function toAdminView(record: RevenueSubmissionRecord): AdminSubmission {
  const base: AdminSubmission = {
    id: record.id,
    fullName: record.fullName,
    repoUrl: record.repoUrl,
    mode: record.mode,
    status: record.status,
    submittedAt: record.submittedAt,
    moderatedAt: record.moderatedAt ?? null,
    moderationNote: record.moderationNote ?? null,
    contact: record.contact,
    notes: record.notes,
  };
  if (record.mode === "trustmrr_link") {
    base.trustmrrSlug = record.trustmrrSlug;
  } else {
    base.mrrCents = record.mrrCents;
    base.customers = record.customers;
    base.paymentProvider = record.paymentProvider;
    base.proofUrl = record.proofUrl;
  }
  return base;
}

export async function GET(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;
  try {
    const records = await listRevenueSubmissions();
    return NextResponse.json({
      ok: true,
      submissions: records.map(toAdminView),
      // Redundant slim field for UI convenience — same data, public-safe shape.
      publicSubmissions: records.map(toPublicRevenueSubmission),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "body must be an object" },
      { status: 400 },
    );
  }
  const payload = body as {
    id?: unknown;
    action?: unknown;
    moderationNote?: unknown;
  };
  if (typeof payload.id !== "string" || !payload.id.trim()) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }
  if (payload.action !== "approve" && payload.action !== "reject") {
    return NextResponse.json(
      { ok: false, error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }
  const moderationNote =
    typeof payload.moderationNote === "string" ? payload.moderationNote.slice(0, 400) : null;

  try {
    const updated = await updateRevenueSubmissionStatus(payload.id, {
      status: payload.action === "approve" ? "approved" : "rejected",
      moderationNote,
    });
    return NextResponse.json({ ok: true, submission: toAdminView(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
