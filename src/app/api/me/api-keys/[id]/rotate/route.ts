// POST /api/me/api-keys/[id]/rotate — DEFERRED to Phase 4C follow-up.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, will issue a fresh plaintext API key for the
// matching id, invalidating the old one. Returns the plaintext ONCE in
// the response body (same shape as /api/me/alert-rules/[id]/rotate-secret).

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
