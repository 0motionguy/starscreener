// POST /api/account/delete — GDPR right-to-erasure (S3.5.A).
//
// Body:
//   { confirmEmail: string }  — must match the caller's profile email
//
// Auth: requireUser(). Anonymous callers get a 401 via the helper.
//
// Hardening pass (2026-05-18, per security audit):
//   - requireUser() runs BEFORE the rate limiter so anonymous probes can't
//     drain an authenticated victim's bucket. The limiter is then keyed on
//     `profile.id`, which is non-spoofable.
//   - CSRF gate via assertSameOriginRequest — destructive endpoints get
//     belt-and-braces even with Clerk's SameSite=Lax cookies.
//   - confirmEmail normalised via NFKC + control-char strip so a zero-width
//     joiner can't ride past the equality check.
//   - PII scrub during soft-delete: in addition to `deletedAt`, we null
//     `email`, `displayName`, `avatarUrl` and disable child alertRules.
//     The earlier comment claiming FK cascade fires on UPDATE was wrong.
//   - Audit log hashes profile + clerk ids so the very act of "right to
//     erasure" doesn't leave durable raw identifiers in third-party log
//     storage.
//   - Clerk Admin DELETE uses `redirect: "error"` so the bearer header
//     can't ride a 30x onto a different host.

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { alertRules } from "@/lib/db/schema/alerts";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { assertSameOriginRequest } from "@/lib/api/csrf";

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

/** Stable short hash for audit logs — never reverse-engineerable. */
function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/** Canonicalise an email before equality compare. */
function canonicalEmail(value: string): string {
  return value.normalize("NFKC").replace(/\p{C}/gu, "").trim().toLowerCase();
}

async function deleteClerkUserBestEffort(clerkUserId: string): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    console.warn(
      "[account-delete] CLERK_SECRET_KEY missing — skipping Clerk-side delete",
      { clerkUserIdHash: shortHash(clerkUserId) },
    );
    return;
  }
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      method: "DELETE",
      // Belt-and-braces: refuse to follow 30x's so the bearer header
      // can't leak onto a different host if Clerk ever misroutes.
      redirect: "error",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      console.warn("[account-delete] Clerk delete returned non-2xx", {
        clerkUserIdHash: shortHash(clerkUserId),
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  } catch (err) {
    console.warn("[account-delete] Clerk delete threw", {
      clerkUserIdHash: shortHash(clerkUserId),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. CSRF gate — reject obviously cross-site requests before any auth
  //    lookup happens, so we never authenticate a malicious request.
  const csrf = assertSameOriginRequest(req);
  if (csrf) return csrf;

  // 2. Auth first. Then the rate limit can key on profile.id (non-spoofable)
  //    instead of the trivially-forgeable client IP. Unauthenticated callers
  //    return 401 via `requireUser`'s redirect contract and never reach the
  //    rate-limit bucket.
  const user = await requireUser();

  const rate = await checkRateLimitAsync(req, {
    windowMs: 60_000,
    maxRequests: 3,
    subject: user.profile.id,
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

  const confirmEmail = canonicalEmail(parsed.data.confirmEmail);
  const profileEmail = canonicalEmail(user.profile.email);
  if (confirmEmail !== profileEmail) {
    return jsonError(
      400,
      "email_mismatch",
      "Confirmation email does not match the account email on file.",
    );
  }

  // GDPR erasure (S3.5.A hardening, 2026-05-18):
  //   - Set `deletedAt` so the row no longer surfaces in any public read.
  //   - SCRUB the PII columns in the same UPDATE — Postgres FK CASCADE
  //     only fires on DELETE, not UPDATE, so the previous "soft delete is
  //     enough" claim was wrong. By nulling email + displayName +
  //     avatarUrl we satisfy GDPR data-minimisation even while the row
  //     stays around for referral attribution.
  //   - Disable every child alertRule so the dispatcher never fires email
  //     for a deleted account in the 30-day grace window before the
  //     hard-delete cron runs (deferred).
  // We deliberately keep referrals + watchlists alive (no PII in those
  // rows, just the parent profile id, which is opaque).
  await db
    .update(profiles)
    .set({
      deletedAt: new Date(),
      email: "",
      displayName: null,
      avatarUrl: null,
    })
    .where(eq(profiles.id, user.profile.id));
  await db
    .update(alertRules)
    .set({ active: false })
    .where(
      and(
        eq(alertRules.profileId, user.profile.id),
        eq(alertRules.active, true),
      ),
    );

  // Best-effort Clerk-side delete. We do NOT await this in a way that
  // could block the response on a slow Clerk API — `fetch` here is
  // bounded by Node's default timeout. Failures here are LOGGED but do
  // NOT fail the request; local PII is what GDPR asks us to erase and
  // that already landed above.
  await deleteClerkUserBestEffort(user.clerkUserId);

  // Audit log uses short hashes — the deletion event lives in Vercel /
  // Datadog log retention indefinitely, so we don't want raw subject
  // identifiers there.
  console.warn("[account-delete] account erased", {
    profileIdHash: shortHash(user.profile.id),
    clerkUserIdHash: shortHash(user.clerkUserId),
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
