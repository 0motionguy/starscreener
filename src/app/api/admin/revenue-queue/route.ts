// Admin moderation endpoint for revenue submissions.
//
// GET  — list all submissions (pending + history). Requires CRON_SECRET bearer.
// POST — { id: string, action: "approve" | "reject", moderationNote?: string }
//        flips status in the JSONL. Approved rows are picked up by
//        src/lib/revenue-overlays.ts's self-reported / trustmrr-link loaders
//        on the next read.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import {
  listRevenueSubmissions,
  toPublicRevenueSubmission,
  updateRevenueSubmissionStatus,
  type RevenueSubmissionRecord,
} from "@/lib/revenue-submissions";

const ModerateRevenueSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  action: z.enum(["approve", "reject"]),
  moderationNote: z.string().max(400).optional().nullable(),
});

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
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
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
    return serverError(err, { scope: "[admin/revenue-queue:GET]" });
  }
}

export async function POST(request: NextRequest) {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny;

  const parsed = await parseBody(request, ModerateRevenueSchema);
  if (!parsed.ok) return parsed.response;

  const moderationNote = parsed.data.moderationNote ?? null;

  try {
    const updated = await updateRevenueSubmissionStatus(parsed.data.id, {
      status: parsed.data.action === "approve" ? "approved" : "rejected",
      moderationNote,
    });
    return NextResponse.json({ ok: true, submission: toAdminView(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return serverError(err, {
      scope: "[admin/revenue-queue:POST]",
      publicMessage: status === 404 ? "submission not found" : "server error",
      status,
    });
  }
}
