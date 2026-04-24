// Admin moderation endpoint for ideas. Mirrors the revenue-queue pattern:
//
// GET  — list every idea (pending + history). ADMIN_TOKEN required.
// POST — { id: string, action: "approve" | "reject", moderationNote?: string }
//        flips status in the JSONL. Approved ideas become publicly listable
//        on /ideas; rejected ideas are kept on disk for audit but suppressed
//        from public reads.

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import {
  listIdeas,
  moderateIdea,
  type IdeaRecord,
} from "@/lib/ideas";

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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AdminMutateResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;

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
    typeof payload.moderationNote === "string"
      ? payload.moderationNote.slice(0, 400)
      : null;

  try {
    const updated = await moderateIdea({
      id: payload.id,
      action: payload.action,
      moderationNote,
    });
    return NextResponse.json({ ok: true, idea: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
