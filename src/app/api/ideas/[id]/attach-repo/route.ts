// POST /api/ideas/[id]/attach-repo — DEFERRED to Phase 4C follow-up.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, this route will let the idea claimer attach a
// GitHub repo (owner/name) to the idea, marking it as the canonical
// build artifact. The IdeaRecord extension (`attachedRepoId`) is
// already planned alongside the claim metadata; the lib accessor +
// validation will land with the implementation.

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotImplementedResponse {
  ok: false;
  error: "not_implemented_phase_4c_followup";
  code: "NOT_IMPLEMENTED";
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: NextRequest,
  _context: RouteContext,
): Promise<NextResponse<NotImplementedResponse>> {
  // Auth-gate is intentional even on the stub — keeps unauthenticated
  // callers from probing the endpoint for shape info, and means flipping
  // the implementation in later doesn't change the public auth contract.
  await requireUser();

  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented_phase_4c_followup",
      code: "NOT_IMPLEMENTED",
    },
    { status: 501, headers: { "Cache-Control": "private, no-store" } },
  );
}
