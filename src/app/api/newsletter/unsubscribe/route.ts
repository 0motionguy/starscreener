// GET /api/newsletter/unsubscribe?t=<token>
//
// One-click unsubscribe. Public, no auth — every email we send must allow
// recipients to unsubscribe without logging in (CAN-SPAM + deliverability).
//
//   1. Verify the HMAC token (no TTL — old digest emails in inboxes months
//      later must still work).
//   2. SET `unsubscribed_at = now()` for the row matching the email.
//   3. Redirect to `/unsubscribed`.
//
// Unsubscribe is idempotent: a second click on the same link is fine and
// just re-stamps `unsubscribed_at` (could be tightened to a "no-op when
// already set" but the simpler write keeps the code honest about
// "unsubscribed = whatever the latest stamp says").

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema/newsletter";
import { verifyUnsubToken } from "@/lib/newsletter/tokens";

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

  const verified = verifyUnsubToken(rawToken);
  if (!verified) {
    return NextResponse.redirect(
      `${baseUrl}/newsletter-error?reason=invalid`,
      { status: 302 },
    );
  }

  const email = verified.email.trim().toLowerCase();

  try {
    await db
      .update(newsletterSubscribers)
      .set({ unsubscribedAt: new Date() })
      .where(eq(newsletterSubscribers.email, email));
  } catch (err) {
    console.error("[api:newsletter:unsubscribe] db update failed", err);
    return NextResponse.redirect(
      `${baseUrl}/newsletter-error?reason=server`,
      { status: 302 },
    );
  }

  return NextResponse.redirect(`${baseUrl}/unsubscribed`, { status: 302 });
}
