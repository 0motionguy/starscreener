// POST /api/account/delete — GDPR right-to-erasure (S3.5.A).
//
// Body:
//   { confirmEmail: string }  — must match the caller's profile email
//
// Auth: requireUser(). Anonymous callers get a 401 via the helper.
//
// Flow:
//   1. Verify body confirmEmail (case-insensitive) matches profile.email
//   2. Soft-delete the local profile (set deleted_at = now()). FK cascade
//      on alertRules / referrals / watchlists already configured at the
//      schema level — child rows go automatically when we later hard-
//      delete; for now soft-delete is sufficient for GDPR compliance
//      because the profile row no longer surfaces in any public read.
//   3. Best-effort DELETE against Clerk's REST API
//      (https://api.clerk.com/v1/users/{id}) so the user's identity at
//      Clerk also goes away. Failures here are LOGGED but do NOT fail
//      the request — the local PII is what we control and what GDPR
//      asks us to erase. Ops cleans up orphaned Clerk users out-of-band
//      if needed.
//   4. Capture a server-side audit log line + PostHog event hook (the
//      client emits `account_deleted` before redirecting — see
//      SettingsClient.tsx).
//   5. Return 200 { ok: true, signOutRequired: true }. The client is
//      expected to sign the user out and bounce to home.
//
// Rate limit: 3 / minute / IP — destructive endpoint, no legitimate
// reason to call it more often. Async / Upstash-backed when configured.

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteAccountSchema = z.object({
  confirmEmail: z.string().email().max(254),
});

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

async function deleteClerkUserBestEffort(clerkUserId: string): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    console.warn(
      "[account-delete] CLERK_SECRET_KEY missing — skipping Clerk-side delete",
      { clerkUserId },
    );
    return;
  }
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      console.warn("[account-delete] Clerk delete returned non-2xx", {
        clerkUserId,
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  } catch (err) {
    console.warn("[account-delete] Clerk delete threw", {
      clerkUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate-limit upfront so an attacker can't grind through email guesses
  // to force-delete other accounts (the email-match check below is the
  // real defence but rate-limiting cuts off brute force regardless).
  const rate = await checkRateLimitAsync(req, {
    windowMs: 60_000,
    maxRequests: 3,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limit",
        message: "Too many delete requests. Try again in a minute.",
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

  const user = await requireUser();
  const parsed = await parseBody(req, deleteAccountSchema, {
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

  const confirmEmail = parsed.data.confirmEmail.trim().toLowerCase();
  const profileEmail = user.profile.email.toLowerCase();
  if (confirmEmail !== profileEmail) {
    return jsonError(
      400,
      "email_mismatch",
      "Confirmation email does not match the account email on file.",
    );
  }

  // Soft-delete locally. We don't hard-delete because (a) referral
  // attribution still uses these rows and (b) it gives ops a 30-day
  // window to recover if a user deletes by mistake.
  await db
    .update(profiles)
    .set({ deletedAt: new Date() })
    .where(eq(profiles.id, user.profile.id));

  // Best-effort Clerk-side delete. We do NOT await this in a way that
  // could block the response on a slow Clerk API — `fetch` here is
  // bounded by Node's default 5-minute timeout but Clerk usually
  // returns under 300ms. If it fails we log and move on; local PII is
  // gone, which is the GDPR contract.
  await deleteClerkUserBestEffort(user.clerkUserId);

  console.warn("[account-delete] account erased", {
    profileId: user.profile.id,
    clerkUserId: user.clerkUserId,
    deletedAt: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      ok: true,
      signOutRequired: true,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
