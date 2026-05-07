// POST /api/newsletter/subscribe
//
// Anonymous newsletter capture endpoint. Powers `<NewsletterCaptureForm />`
// on the homepage hero. Public — no auth gate (Clerk middleware bypass via
// `/api/newsletter/*` is already in place by virtue of these routes not
// being in the matcher's protect list... but referrals are public, so are
// we).
//
// Flow:
//   1. Validate body via Zod ({ email }) — reject anything that isn't a
//      valid email shape.
//   2. INSERT into `newsletter_subscribers` with `confirmed_at = null`.
//      Stable per-row `unsubscribe_token` minted at insert (HMAC). The
//      `confirm_token_hash` stores `sha256(mintConfirmToken(email, ts))`
//      so the matching token from the email click can be re-derived.
//   3. ON CONFLICT (email):
//        - if `confirmed_at IS NOT NULL` → return success silently. We do
//          NOT reveal subscription status to the caller (anti-enumeration).
//        - if `confirmed_at IS NULL` AND `subscribed_at < now() - 1h` →
//          re-mint token + re-send confirmation. Soft rate-limit prevents
//          someone from carpeting an inbox by spamming the form.
//        - if `confirmed_at IS NULL` AND `subscribed_at < now() - 1h` →
//          return success silently (rate-limit hit).
//   4. Send the confirmation email via `sendEmail()` (Resend in prod,
//      ConsoleProvider in dev — see `src/lib/email/send.ts`).
//
// Always returns `{ ok: true }` for valid emails, regardless of outcome.
// Idempotent + non-revealing by design.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema/newsletter";
import { resolveEmailFrom, sendEmail } from "@/lib/email/send";
import { renderNewsletterConfirmEmail } from "@/lib/email/templates/newsletter-confirm";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import {
  mintConfirmToken,
  mintUnsubToken,
} from "@/lib/newsletter/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

/** 1-hour soft rate-limit per email between confirmation re-sends. */
const RESEND_RATE_LIMIT_MS = 60 * 60 * 1_000;

const SubscribeSchema = z.object({
  email: z.string().email().max(254),
  /** Optional, defaults to "hero" — distinguishes form placements over time. */
  source: z.string().min(1).max(32).optional(),
});

interface SubscribeOk {
  ok: true;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env && env.length > 0) return env.replace(/\/+$/, "");
  // Fall back to the request's own origin — works in dev (localhost:3023)
  // and on any preview deploy where NEXT_PUBLIC_SITE_URL isn't pinned.
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function sendConfirmationEmail(
  email: string,
  baseUrl: string,
): Promise<{ confirmTokenHash: string }> {
  const ts = Date.now();
  const confirmToken = mintConfirmToken(email, ts);
  const confirmUrl = `${baseUrl}/api/newsletter/confirm?t=${encodeURIComponent(confirmToken)}`;
  const { subject, html, text } = renderNewsletterConfirmEmail({
    email,
    confirmUrl,
  });
  await sendEmail({
    to: email,
    from: resolveEmailFrom(),
    subject,
    html,
    text,
  });
  return { confirmTokenHash: hashToken(confirmToken) };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<SubscribeOk | { ok: false; error: string; code?: string }>> {
  // Body parse — JSON only.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      errorEnvelope("invalid JSON body", "BAD_REQUEST"),
      { status: 400, headers: POST_CACHE_HEADERS },
    );
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorEnvelope("invalid email", "INVALID_EMAIL"),
      { status: 400, headers: POST_CACHE_HEADERS },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source?.trim() ?? "hero";
  const baseUrl = getBaseUrl(request);

  try {
    const existing = await db
      .select({
        id: newsletterSubscribers.id,
        subscribedAt: newsletterSubscribers.subscribedAt,
        confirmedAt: newsletterSubscribers.confirmedAt,
        unsubscribedAt: newsletterSubscribers.unsubscribedAt,
      })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    const row = existing[0];

    if (row) {
      // Already confirmed → silent success (no leak).
      if (row.confirmedAt !== null) {
        return NextResponse.json(
          { ok: true } satisfies SubscribeOk,
          { headers: POST_CACHE_HEADERS },
        );
      }
      // Pending confirmation: rate-limit re-sends to 1/hour per email.
      const subscribedMs = row.subscribedAt.getTime();
      const elapsed = Date.now() - subscribedMs;
      if (elapsed < RESEND_RATE_LIMIT_MS) {
        return NextResponse.json(
          { ok: true } satisfies SubscribeOk,
          { headers: POST_CACHE_HEADERS },
        );
      }
      // Outside the window → re-mint + re-send + bump subscribed_at so the
      // limit window resets.
      const { confirmTokenHash } = await sendConfirmationEmail(email, baseUrl);
      await db
        .update(newsletterSubscribers)
        .set({
          confirmTokenHash,
          subscribedAt: new Date(),
          // Refreshing the unsub token would invalidate any prior unsub link
          // they may have stashed from another subscribe attempt — leave it.
        })
        .where(eq(newsletterSubscribers.id, row.id));
      return NextResponse.json(
        { ok: true } satisfies SubscribeOk,
        { headers: POST_CACHE_HEADERS },
      );
    }

    // Fresh insert path.
    const { confirmTokenHash } = await sendConfirmationEmail(email, baseUrl);
    const unsubscribeToken = mintUnsubToken(email);
    await db.insert(newsletterSubscribers).values({
      email,
      source,
      confirmTokenHash,
      unsubscribeToken,
    });
    return NextResponse.json(
      { ok: true } satisfies SubscribeOk,
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    return serverError<SubscribeOk | { ok: false; error: string; code?: string }>(
      err,
      {
        scope: "[api:newsletter:subscribe]",
        publicMessage: "subscription failed",
      },
    );
  }
}
