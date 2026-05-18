// /api/me/profile — caller's global notification preferences (Chunk D)
// + S3.5.B display profile editing (displayName + avatarUrl).
//
// PATCH → update `email_alerts_cadence`, `quiet_hours`, `timezone`, the
//         three email opt-in flags, plus `display_name` and
//         `avatar_url`. Returns the updated row (with the bcrypt/scrypt
//         mcp_token_hash redacted to `mcpTokenLast4` only, so the client
//         can render "•••• ABCD" without ever touching the hash).
//
// Auth: requireUser(). The caller can only PATCH their own profile;
// the row is identified by `user.profile.id`.
//
// Hardening (2026-05-18, per security audit):
//   - CSRF gate via `assertSameOriginRequest` — Clerk's SameSite=Lax cookies
//     block naive cross-site POSTs but not same-site sub-domain requests,
//     so this is belt-and-braces for an authenticated PATCH endpoint.
//   - Rate-limit 20/min keyed on `profile.id` (the limiter falls back to
//     the Vercel-signed IP header if no subject is passed; here we always
//     have one because we require auth).

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema/profiles";
import { patchProfilePrefsSchema } from "@/lib/api/alert-rules/schemas";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { assertSameOriginRequest } from "@/lib/api/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ErrorBody {
  ok: false;
  error: string;
  message: string;
  details?: unknown;
}

function jsonError(
  status: number,
  error: string,
  message: string,
  details?: unknown,
): NextResponse<ErrorBody> {
  return NextResponse.json(
    { ok: false, error, message, ...(details ? { details } : {}) },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Strip bcrypt/scrypt hash before returning the profile to the client. */
function safeProfile(
  row: Profile,
): Omit<Profile, "mcpTokenHash"> & { hasMcpToken: boolean } {
  const { mcpTokenHash, ...rest } = row;
  return { ...rest, hasMcpToken: Boolean(mcpTokenHash) };
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  // CSRF gate — reject obviously cross-site requests before any auth lookup.
  const csrf = assertSameOriginRequest(req);
  if (csrf) return csrf;

  const user = await requireUser();

  // Authenticated rate limit: 20 PATCHes/min/profile. The endpoint is
  // non-destructive but a compromised session shouldn't be able to mass-
  // rewrite display names or drive write amplification.
  const rate = await checkRateLimitAsync(req, {
    windowMs: 60_000,
    maxRequests: 20,
    subject: user.profile.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limit",
        message: "Too many profile updates. Try again in a minute.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  const parsed = await parseBody(req, patchProfilePrefsSchema, {
    publicMessage: "request body failed validation",
  });
  if (!parsed.ok) {
    const body = (await parsed.response.json()) as {
      error?: string;
      details?: unknown;
    };
    const invalidJson = body.error === "request body is not valid JSON";
    return invalidJson
      ? jsonError(400, "invalid_json", "request body is not valid JSON")
      : jsonError(
          400,
          "validation",
          "request body failed validation",
          body.details,
        );
  }
  const data = parsed.data;

  // Only set fields the caller actually supplied.
  const updateSet: Partial<Profile> = {};
  if (data.emailAlertsCadence !== undefined)
    updateSet.emailAlertsCadence = data.emailAlertsCadence;
  if (data.quietHours !== undefined) updateSet.quietHours = data.quietHours;
  if (data.timezone !== undefined) updateSet.timezone = data.timezone;
  if (data.emailReferralUpdates !== undefined)
    updateSet.emailReferralUpdates = data.emailReferralUpdates;
  if (data.emailProductUpdates !== undefined)
    updateSet.emailProductUpdates = data.emailProductUpdates;
  if (data.emailSystem !== undefined) updateSet.emailSystem = data.emailSystem;
  // S3.5.B — empty string normalises to null so the column stays
  // canonically empty rather than carrying a zero-length string.
  if (data.displayName !== undefined)
    updateSet.displayName =
      typeof data.displayName === "string" && data.displayName.trim().length > 0
        ? data.displayName.trim()
        : null;
  if (data.avatarUrl !== undefined)
    updateSet.avatarUrl =
      typeof data.avatarUrl === "string" && data.avatarUrl.trim().length > 0
        ? data.avatarUrl.trim()
        : null;

  const updated = await db
    .update(profiles)
    .set(updateSet)
    .where(eq(profiles.id, user.profile.id))
    .returning();

  if (updated.length === 0) {
    return jsonError(404, "not_found", "profile not found");
  }

  return NextResponse.json(
    { ok: true, profile: safeProfile(updated[0]) },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
