// GET    /api/me/api-keys — DEFERRED to Phase 4C follow-up.
// POST   /api/me/api-keys — DEFERRED to Phase 4C follow-up.
// DELETE /api/me/api-keys — DEFERRED to Phase 4C follow-up.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, this route will manage per-user MCP / programmatic
// API keys. List, create (returns plaintext once), and bulk-delete the
// caller's keys. Backed by a new key-storage layer (likely the existing
// profiles.mcp_token_hash column extended, or a sibling table).

import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotImplementedResponse {
  ok: false;
  error: "not_implemented_phase_4c_followup";
  code: "NOT_IMPLEMENTED";
}

async function stub(): Promise<NextResponse<NotImplementedResponse>> {
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

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<NotImplementedResponse>> {
  return stub();
}

export async function POST(
  _request: NextRequest,
): Promise<NextResponse<NotImplementedResponse>> {
  return stub();
}

export async function DELETE(
  _request: NextRequest,
): Promise<NextResponse<NotImplementedResponse>> {
  return stub();
}
