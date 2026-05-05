import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope } from "@/lib/api/error-response";
import { AuthQuarantineError } from "@/lib/errors";

function normalizeHttpOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function requestOrigin(request: NextRequest): string | null {
  const headerOrigin = normalizeHttpOrigin(request.headers.get("origin"));
  if (headerOrigin) return headerOrigin;
  return normalizeHttpOrigin(request.nextUrl.origin);
}

function serverOrigin(request: NextRequest): string | null {
  return normalizeHttpOrigin(request.nextUrl.origin);
}

export function enforceMutationSameOrigin(
  request: NextRequest,
): { ok: true } | { ok: false; response: NextResponse; error: AuthQuarantineError } {
  const origin = requestOrigin(request);
  const expected = serverOrigin(request);
  if (origin && expected && origin === expected) return { ok: true };
  const error = new AuthQuarantineError("cross-origin mutation denied", {
    scope: "api/mutation-origin-guard",
    origin: origin ?? "missing",
    expected: expected ?? "missing",
    method: request.method,
    path: request.nextUrl.pathname,
  });
  return {
    ok: false,
    error,
    response: NextResponse.json(
      errorEnvelope("cross-origin mutation denied", "ORIGIN_DENIED"),
      { status: 403 },
    ),
  };
}
