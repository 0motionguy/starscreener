// GET/POST /api/keys
//
// Self-serve API key lifecycle for the authenticated caller. Generated keys
// are shown once; only SHA-256 hashes are persisted.

import { NextRequest, NextResponse } from "next/server";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { createApiKey, listApiKeys } from "@/lib/api/api-keys";

const HEADERS = { "Cache-Control": "no-store" } as const;

interface CreateKeyBody {
  name?: unknown;
}

export async function GET(request: NextRequest) {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false as const, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: HEADERS },
    );
  }

  const keys = await listApiKeys(auth.userId);
  return NextResponse.json({ ok: true as const, keys }, { headers: HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false as const, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: HEADERS },
    );
  }

  let body: CreateKeyBody = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as CreateKeyBody;
    }
  } catch {
    body = {};
  }

  const name = typeof body.name === "string" ? body.name : "Default key";
  const result = await createApiKey(auth.userId, name);
  return NextResponse.json(
    {
      ok: true as const,
      key: result.record,
      token: result.token,
      warning: "Store this token now. StarScreener only returns it once.",
    },
    { headers: HEADERS },
  );
}
