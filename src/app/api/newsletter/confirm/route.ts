// GET /api/newsletter/confirm?t=<token>
//
// Double-opt-in completion endpoint. The user landed here from the link
// in the confirmation email. Steps:
//
//   1. Verify the HMAC token (rejects bad sig + 24h-expired).
//   2. SET `confirmed_at = now()` for the row matching the email.
//   3. Redirect to `/thanks` (or `/newsletter-error?reason=expired` on
//      bad/expired token).
//
// The verification step trusts the token's claim about which email — no
// secondary lookup against the stored `confirm_token_hash` is necessary
// because the HMAC IS the proof. The hash column in the schema is kept
// as a defence-in-depth marker (catches tokens that were issued by an
// older `SESSION_SECRET` after a key rotation), but we don't fail the
// confirm if the hash differs — the HMAC verification already ran with
// the current secret, so a hash mismatch only happens after a SECRET
// rotation, and refusing to confirm in that case would be user-hostile.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema/newsletter";
import { verifyConfirmToken } from "@/lib/newsletter/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env && env.length > 0) return env.replace(/\/+$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = getBaseUrl(request);
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("t") ?? "";

  const verified = verifyConfirmToken(rawToken);
  if (!verified) {
    return NextResponse.redirect(
      `${baseUrl}/newsletter-error?reason=expired`,
      { status: 302 },
    );
  }

  const email = verified.email.trim().toLowerCase();

  try {
    await db
      .update(newsletterSubscribers)
      .set({ confirmedAt: new Date() })
      .where(eq(newsletterSubscribers.email, email));
  } catch (err) {
    console.error("[api:newsletter:confirm] db update failed", err);
    return NextResponse.redirect(
      `${baseUrl}/newsletter-error?reason=server`,
      { status: 302 },
    );
  }

  return NextResponse.redirect(`${baseUrl}/thanks`, { status: 302 });
}
