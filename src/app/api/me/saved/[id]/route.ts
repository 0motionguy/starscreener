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
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { unsaveIdea } from "@/lib/saved-ideas";

// Per-user rate-limit on unsave toggles. Mirrors the cap on POST
// /api/me/saved — same JSONL is rewritten on each DELETE, so the same
// storage-amplification + lock-contention risk applies.
const SAVED_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

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
  request: NextRequest,
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

  const rate = await checkRateLimitAsync(request, {
    ...SAVED_RATE_LIMIT,
    subject: user.profile.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate limit exceeded — try again shortly",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

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
