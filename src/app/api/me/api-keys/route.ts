// GET    /api/me/api-keys — deferred endpoint stub.
// POST   /api/me/api-keys — deferred endpoint stub.
// DELETE /api/me/api-keys — deferred endpoint stub.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, this route will manage per-user MCP / programmatic
// API keys. List, create (returns plaintext once), and bulk-delete the
// caller's keys. Backed by a new key-storage layer (likely the existing
// profiles.mcp_token_hash column extended, or a sibling table).

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotImplementedResponse {
  ok: false;
  error: "not_implemented";
  code: "NOT_IMPLEMENTED";
}

interface UnauthorizedResponse {
  ok: false;
  error: "unauthorized";
  code: "UNAUTHORIZED";
}

async function stub(): Promise<
  NextResponse<NotImplementedResponse | UnauthorizedResponse>
> {
  // Auth-gate stays on the stub so the public auth contract doesn't change
  // when the implementation ships. JSON 401 (not Clerk's HTML redirect) is
  // the right primitive for an API consumer probing the endpoint.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented",
      code: "NOT_IMPLEMENTED",
    },
    { status: 501, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(): Promise<
  NextResponse<NotImplementedResponse | UnauthorizedResponse>
> {
  return stub();
}

export async function POST(): Promise<
  NextResponse<NotImplementedResponse | UnauthorizedResponse>
> {
  return stub();
}

export async function DELETE(): Promise<
  NextResponse<NotImplementedResponse | UnauthorizedResponse>
> {
  return stub();
}
