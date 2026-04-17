// Shared tri-state CRON_SECRET auth helper.
//
// Extracted from /api/cron/ingest so /api/pipeline/{ingest,recompute,persist,cleanup}
// and other admin endpoints can share the exact same behavior:
//
//   - "ok":                 authenticated, OR CRON_SECRET unset in dev (convenience).
//   - "unauthorized":       CRON_SECRET set but header missing / wrong  → 401.
//   - "not_configured":     CRON_SECRET unset in production             → 503.
//
// Header shape:
//   Authorization: Bearer <CRON_SECRET>   (raw <CRON_SECRET> also accepted).

import { NextRequest, NextResponse } from "next/server";

export type AuthVerdict =
  | { kind: "ok" }
  | { kind: "unauthorized" }
  | { kind: "not_configured" };

export function verifyCronAuth(request: NextRequest): AuthVerdict {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { kind: "not_configured" };
    }
    return { kind: "ok" };
  }
  const header = request.headers.get("authorization");
  if (!header) return { kind: "unauthorized" };
  const trimmed = header.trim();
  if (trimmed === secret) return { kind: "ok" };
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice("Bearer ".length) === secret
      ? { kind: "ok" }
      : { kind: "unauthorized" };
  }
  return { kind: "unauthorized" };
}

/**
 * Returns a ready-to-send NextResponse for the non-ok verdicts, or null if
 * the verdict is "ok". Handlers can do:
 *
 *   const deny = authFailureResponse(verifyCronAuth(request));
 *   if (deny) return deny;
 */
export function authFailureResponse(
  verdict: AuthVerdict,
): NextResponse | null {
  if (verdict.kind === "ok") return null;
  if (verdict.kind === "unauthorized") {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { ok: false, reason: "CRON_SECRET not configured" },
    { status: 503 },
  );
}
