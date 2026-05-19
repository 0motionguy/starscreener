// POST /api/ideas/[id]/claim — claim ownership of an idea.
// lint-allow: no-parsebody - no-body endpoint; requireUser is the trust boundary.
//
// Idempotent for the calling user. If a different user has already
// claimed the idea, returns 409. If the idea is in a terminal state
// (rejected / shipped / archived), returns 409 with a reason.
//
// Auth: requireUser() (Clerk). The caller's profile.clerkUserId is
// what gets recorded — matches the pattern in /api/ideas POST where
// authorId is derived server-side and never trusted from the body.

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { serverError } from "@/lib/api/error-response";
import { claimIdea, toPublicIdea, type PublicIdea } from "@/lib/ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClaimSuccessResponse {
  ok: true;
  /** Outcome flag so the client can distinguish first-claim from re-claim. */
  outcome: "claimed" | "already-by-self";
  idea: PublicIdea;
}

interface ClaimConflictResponse {
  ok: false;
  error: string;
  code: "ALREADY_CLAIMED" | "NOT_CLAIMABLE";
  idea?: PublicIdea;
}

interface ClaimErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteContext,
): Promise<
  NextResponse<ClaimSuccessResponse | ClaimConflictResponse | ClaimErrorResponse>
> {
  const { id } = await context.params;
  if (!id || id.length === 0) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const user = await requireUser();

  try {
    const outcome = await claimIdea(id, user.clerkUserId);
    switch (outcome.kind) {
      case "claimed":
      case "already-by-self":
        return NextResponse.json({
          ok: true,
          outcome: outcome.kind,
          idea: toPublicIdea(outcome.record),
        });
      case "already-by-other":
        return NextResponse.json(
          {
            ok: false,
            error: "idea is already claimed by another user",
            code: "ALREADY_CLAIMED",
            idea: toPublicIdea(outcome.record),
          },
          { status: 409 },
        );
      case "not-claimable":
        return NextResponse.json(
          {
            ok: false,
            error: outcome.reason,
            code: "NOT_CLAIMABLE",
          },
          { status: 409 },
        );
      case "not-found":
        return NextResponse.json(
          { ok: false, error: "idea not found" },
          { status: 404 },
        );
    }
  } catch (err) {
    return serverError<ClaimErrorResponse>(err, { scope: "[ideas/:id/claim]" });
  }
}
