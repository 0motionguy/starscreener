// GET  /api/me/saved        — list the caller's saved ideas (newest first).
// POST /api/me/saved        — save an idea. Body: { ideaId: string }.
//                              Idempotent — a re-save of the same idea
//                              returns 200 with outcome "already-saved".
//
// Auth: every handler funnels through requireUser() — same pattern as
// /api/me/alert-rules.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { getIdeaById } from "@/lib/ideas";
import { listSavedIdeas, saveIdea, type SavedIdea } from "@/lib/saved-ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SavedPostSchema = z.object({
  ideaId: z.string().min(1).max(64),
});

interface SavedListResponse {
  ok: true;
  saved: SavedIdea[];
  total: number;
}

interface SavedCreateResponse {
  ok: true;
  outcome: "saved" | "already-saved";
  saved: SavedIdea;
}

interface SavedErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<SavedListResponse | SavedErrorResponse>> {
  const user = await requireUser();
  try {
    const saved = await listSavedIdeas(user.clerkUserId);
    return NextResponse.json(
      { ok: true, saved, total: saved.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError<SavedErrorResponse>(err, { scope: "[me/saved:GET]" });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<SavedCreateResponse | SavedErrorResponse>> {
  const user = await requireUser();

  const parsed = await parseBody(request, SavedPostSchema);
  if (!parsed.ok) {
    return parsed.response as NextResponse<SavedErrorResponse>;
  }
  const { ideaId } = parsed.data;

  try {
    // Reject saves against ideas that aren't real or aren't public —
    // pending_moderation/rejected are private to the queue.
    const idea = await getIdeaById(ideaId);
    if (
      !idea ||
      idea.status === "pending_moderation" ||
      idea.status === "rejected"
    ) {
      return NextResponse.json(
        { ok: false, error: "idea not found", code: "IDEA_NOT_FOUND" },
        { status: 404 },
      );
    }

    const outcome = await saveIdea(user.clerkUserId, ideaId);
    return NextResponse.json(
      {
        ok: true,
        outcome: outcome.kind,
        saved: outcome.record,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError<SavedErrorResponse>(err, { scope: "[me/saved:POST]" });
  }
}
