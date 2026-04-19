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
//
// Token comparison uses crypto.timingSafeEqual to blunt remote timing
// attacks on the bearer-token compare (P-108, F-SENT-001 / F-SENT-008).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export type AuthVerdict =
  | { kind: "ok" }
  | { kind: "unauthorized" }
  | { kind: "not_configured" };

/**
 * Constant-time string equality. Length mismatches short-circuit because
 * length is not a secret — the content of the expected secret is.
 *
 * Exported for tests; production callers go through verifyCronAuth.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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
  if (timingSafeEqualStr(trimmed, secret)) return { kind: "ok" };
  if (trimmed.startsWith("Bearer ")) {
    const candidate = trimmed.slice("Bearer ".length);
    return timingSafeEqualStr(candidate, secret)
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
