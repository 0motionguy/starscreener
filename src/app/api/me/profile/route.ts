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
import { parseBody } from "@/lib/api/parse-body";

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
