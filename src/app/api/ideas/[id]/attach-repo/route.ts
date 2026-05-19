// POST /api/ideas/[id]/attach-repo — deferred endpoint stub.
// lint-allow: no-parsebody - stub returning 501; no body is parsed yet.
//
// Once implemented, this route will let the idea claimer attach a
// GitHub repo (owner/name) to the idea, marking it as the canonical
// build artifact. The IdeaRecord extension (`attachedRepoId`) is
// already planned alongside the claim metadata; the lib accessor +
// validation will land with the implementation.

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
  // Auth-gate is intentional even on the stub — keeps unauthenticated
  // callers from probing the endpoint for shape info, and means flipping
  // the implementation in later doesn't change the public auth contract.
  // JSON 401 (not Clerk's HTML redirect) is the right primitive for an
  // API consumer probing the endpoint.
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
