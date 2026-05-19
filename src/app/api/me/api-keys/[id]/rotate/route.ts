// POST /api/me/api-keys/[id]/rotate — deferred endpoint stub.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, will issue a fresh plaintext API key for the
// matching id, invalidating the old one. Returns the plaintext ONCE in
// the response body (same shape as /api/me/alert-rules/[id]/rotate-secret).

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

export async function POST(): Promise<
  NextResponse<NotImplementedResponse | UnauthorizedResponse>
> {
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
