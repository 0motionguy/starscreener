// DELETE /api/me/saved/[id] — remove a save by ideaId. The "[id]" route
// lint-allow: no-parsebody - no-body endpoint; requireUser is the trust boundary.
// segment is the idea's id (not the save row's id) so the UI doesn't
// need to track per-save handles.
//
// Idempotent — DELETE on an unsaved idea returns 200 with outcome
// "not-found" rather than 404, so the client can call this from a
// debounced toggle without distinguishing "wasn't saved" from
// "successfully removed". Returns 404 only when the user is unsigned.

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { serverError } from "@/lib/api/error-response";
import { unsaveIdea } from "@/lib/saved-ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SavedDeleteResponse {
  ok: true;
  outcome: "removed" | "not-found";
}

interface SavedDeleteErrorResponse {
  ok: false;
  error: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<SavedDeleteResponse | SavedDeleteErrorResponse>> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const user = await requireUser();

  try {
    const outcome = await unsaveIdea(user.clerkUserId, id);
    return NextResponse.json(
      { ok: true, outcome: outcome.kind },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError<SavedDeleteErrorResponse>(err, {
      scope: "[me/saved/:id:DELETE]",
    });
  }
}
