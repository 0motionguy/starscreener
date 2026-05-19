// GET  /api/build/timeline — DEFERRED to Phase 4C follow-up.
// POST /api/build/timeline — DEFERRED to Phase 4C follow-up.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, GET will return the public build-timeline feed
// (idea claimed / scoping / building / shipped events) and POST will
// let the idea claimer publish a build-event row attached to a claimed
// idea. Backed by a new src/lib/build-timeline.ts JSONL store.

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotImplementedResponse {
  ok: false;
  error: "not_implemented_phase_4c_followup";
  code: "NOT_IMPLEMENTED";
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<NotImplementedResponse>> {
  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented_phase_4c_followup",
      code: "NOT_IMPLEMENTED",
    },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  _request: NextRequest,
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
