// Admin moderation endpoint for ideas. Mirrors the revenue-queue pattern:
//
// GET  — list every idea (pending + history). ADMIN_TOKEN required.
// POST — { id: string, action: "approve" | "reject", moderationNote?: string }
//        flips status in the JSONL. Approved ideas become publicly listable
//        on /ideas; rejected ideas are kept on disk for audit but suppressed
//        from public reads.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import {
  listIdeas,
  moderateIdea,
  type IdeaRecord,
} from "@/lib/ideas";

export const runtime = "nodejs";

const ModerateIdeaSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  action: z.enum(["approve", "reject"]),
  moderationNote: z.string().max(400).optional().nullable(),
});

interface AdminListResponse {
  ok: true;
  ideas: IdeaRecord[];
}

interface AdminMutateResponse {
  ok: true;
  idea: IdeaRecord;
}

interface AdminErrorResponse {
  ok: false;
  error: string;
  reason?: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminListResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;
  try {
    const ideas = await listIdeas();
    return NextResponse.json({ ok: true, ideas });
  } catch (err) {
    return serverError<AdminErrorResponse>(err, { scope: "[admin/ideas-queue:GET]" });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AdminMutateResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;

  const parsed = await parseBody(request, ModerateIdeaSchema);
  if (!parsed.ok) return parsed.response as NextResponse<AdminErrorResponse>;

  const moderationNote = parsed.data.moderationNote ?? null;

  try {
    const updated = await moderateIdea({
      id: parsed.data.id,
      action: parsed.data.action,
      moderationNote,
    });
    return NextResponse.json({ ok: true, idea: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return serverError<AdminErrorResponse>(err, {
      scope: "[admin/ideas-queue:POST]",
      publicMessage: status === 404 ? "idea not found" : "server error",
      status,
    });
  }
}
