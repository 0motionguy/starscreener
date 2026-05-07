// /api/me/profile — caller's global notification preferences (Chunk D).
//
// PATCH → update `email_alerts_cadence`, `quiet_hours`, `timezone`, and
//         the three email opt-in flags. Returns the updated row (with
//         the bcrypt/scrypt mcp_token_hash redacted to `mcpTokenLast4`
//         only, so the client can render "•••• ABCD" without ever
//         touching the hash).
//
// Auth: requireUser(). The caller can only PATCH their own profile;
// the row is identified by `user.profile.id`.

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema/profiles";
import { patchProfilePrefsSchema } from "@/lib/api/alert-rules/schemas";

// lint-allow: no-parsebody - PATCH body is Zod safeParsed here to preserve the route-specific error envelope.
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
  const user = await requireUser();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "request body is not valid JSON");
  }

  const parsed = patchProfilePrefsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      "validation",
      "request body failed validation",
      parsed.error.issues,
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
