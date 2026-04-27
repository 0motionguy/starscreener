// DELETE /api/keys/{id}

import { NextRequest, NextResponse } from "next/server";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { revokeApiKey } from "@/lib/api/api-keys";

const HEADERS = { "Cache-Control": "no-store" } as const;

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false as const, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: HEADERS },
    );
  }

  const { id } = await context.params;
  const key = await revokeApiKey(auth.userId, id);
  if (!key) {
    return NextResponse.json(
      { ok: false as const, error: "key not found", code: "NOT_FOUND" },
      { status: 404, headers: HEADERS },
    );
  }

  return NextResponse.json({ ok: true as const, key }, { headers: HEADERS });
}
