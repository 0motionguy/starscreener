// /api/me/alert-rules/[id]/rotate-secret — rotate webhook secret (Chunk D).
//
// POST → confirms ownership, generates a new `whsec_<64 hex chars>`,
//        scrypt-hashes it, updates the row, returns the plaintext ONCE.
//        After the response is delivered the plaintext is gone — caller
//        must rotate again to get a new one.
//
// Auth: requireUser(). Cross-user requests get 404 (no existence leak).

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, scryptSync } from "node:crypto";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { alertRules } from "@/lib/db/schema/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// scrypt parameters mirror `route.ts` — keep these in lockstep if
// either changes.
const SCRYPT_N = 1 << 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const SCRYPT_SALT_LEN = 16;

interface ErrorBody {
  ok: false;
  error: string;
  message: string;
}

function jsonError(
  status: number,
  error: string,
  message: string,
): NextResponse<ErrorBody> {
  return NextResponse.json(
    { ok: false, error, message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function jsonOk<T extends Record<string, unknown>>(data: T): NextResponse {
  return NextResponse.json(
    { ok: true, ...data },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!id) {
    return jsonError(400, "missing_id", "rule id is required");
  }

  // Confirm ownership AND that the rule actually has a webhook URL —
  // rotating a secret on a rule with no webhook is a no-op the caller
  // probably didn't mean.
  const owned = await db
    .select({
      id: alertRules.id,
      webhookUrl: alertRules.webhookUrl,
    })
    .from(alertRules)
    .where(
      and(eq(alertRules.id, id), eq(alertRules.profileId, user.profile.id)),
    )
    .limit(1);
  if (owned.length === 0) {
    return jsonError(404, "not_found", "rule not found");
  }
  if (!owned[0].webhookUrl) {
    return jsonError(
      400,
      "no_webhook_url",
      "rule has no webhook_url; cannot rotate a secret",
    );
  }

  // Generate fresh secret + scrypt hash. Storage layout is `<salt>:<hash>`
  // hex-encoded (verifyWebhookSecret in route.ts splits on ':' to verify).
  const plaintext = `whsec_${randomBytes(32).toString("hex")}`;
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = scryptSync(plaintext, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const storedHash = `${salt.toString("hex")}:${derived.toString("hex")}`;

  await db
    .update(alertRules)
    .set({
      webhookSecretHash: storedHash,
      updatedAt: new Date(),
    })
    .where(
      and(eq(alertRules.id, id), eq(alertRules.profileId, user.profile.id)),
    );

  return jsonOk({ webhookSecret: plaintext });
}
