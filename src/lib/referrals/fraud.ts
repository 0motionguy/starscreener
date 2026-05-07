// Referral fraud signal computation.
//
// v1 policy (per plan): log everything, auto-block ONE flag.
//
//   - `same_clerk_user`    — same Clerk account on both sides → ALWAYS
//                            block (caller checks `BLOCKING_FRAUD_FLAGS`
//                            and skips the `referrals` insert).
//   - `same_ip_24h`        — same `ip_hash` seen in `referrals` within
//                            the last 24 hours → log only.
//   - `same_email_domain`  — same email domain on both sides AND that
//                            domain is NOT in the FREE_EMAIL_DOMAINS
//                            allowlist → log only.
//
// The other documented signals (`fast_signup`, `never_returned`,
// `admin_rejected`) are produced by other code paths (qualify cron, admin
// reject endpoint) — not here. This module computes only the signals
// available at signup time.
//
// Pure-ish: takes a Drizzle `db` instance + input shape, runs at most
// two SELECTs, returns a string array. No side effects.

import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { profiles } from "@/lib/db/schema/profiles";
import { referrals } from "@/lib/db/schema/referrals";
import type { db as dbType } from "@/lib/db/client";

/**
 * Flags that, when present, force the webhook to skip the
 * `referrals` insert entirely. `admin_rejected` is included because it
 * means an operator already vetoed this attribution path; if it ever
 * shows up here (e.g. retry path), don't re-credit.
 */
export const BLOCKING_FRAUD_FLAGS = [
  "same_clerk_user",
  "admin_rejected",
] as const;

export type BlockingFraudFlag = (typeof BLOCKING_FRAUD_FLAGS)[number];

/**
 * Free / consumer email domains. Two referrals from the same domain in
 * this list are not suspicious — it's just gmail. Outside this list,
 * matching domains are a fraud signal worth flagging for manual review.
 */
export const FREE_EMAIL_DOMAINS: readonly string[] = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "pm.me",
  "aol.com",
  "live.com",
  "gmx.com",
  "mail.com",
];

export interface FraudCheckInput {
  /** UUID of the referrer's profiles row. */
  referrerProfileId: string;
  /** Clerk user id of the user who just signed up. */
  referredClerkUserId: string;
  /** Email of the user who just signed up. */
  referredEmail: string;
  /** Raw IP from the webhook (forwarded header). Optional. */
  referredIp?: string | null;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * Compute the fraud-flag string array for a `referrals` insert. The
 * caller is responsible for passing the array to `BLOCKING_FRAUD_FLAGS`
 * and skipping the insert when any blocking flag is present.
 */
export async function computeFraudFlags(
  db: typeof dbType,
  input: FraudCheckInput,
): Promise<string[]> {
  const flags: string[] = [];

  // 1. same_clerk_user — referrer's clerk_user_id matches referred's.
  //    The check is symmetric; we only need to look up the referrer.
  const referrerRow = await db
    .select({
      clerkUserId: profiles.clerkUserId,
      email: profiles.email,
    })
    .from(profiles)
    .where(eq(profiles.id, input.referrerProfileId))
    .limit(1);

  if (referrerRow.length > 0) {
    if (referrerRow[0].clerkUserId === input.referredClerkUserId) {
      flags.push("same_clerk_user");
      // Short-circuit: if the same user is both sides, the other checks
      // are noise. The caller already blocks on this flag.
      return flags;
    }

    // 2. same_email_domain — referrer's email domain matches referred's,
    //    and the domain isn't in the free-email allowlist.
    const refDomain = emailDomain(referrerRow[0].email);
    const newDomain = emailDomain(input.referredEmail);
    if (
      refDomain &&
      newDomain &&
      refDomain === newDomain &&
      !FREE_EMAIL_DOMAINS.includes(refDomain)
    ) {
      flags.push("same_email_domain");
    }
  }

  // 3. same_ip_24h — any `referrals` row in the last 24h with this IP hash.
  if (input.referredIp) {
    const ipHash = hashIp(input.referredIp);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ id: referrals.id })
      .from(referrals)
      .where(
        and(
          eq(referrals.ipHash, ipHash),
          gt(referrals.createdAt, since),
        ),
      )
      .limit(1);
    if (recent.length > 0) {
      flags.push("same_ip_24h");
    }
  }

  return flags;
}

/**
 * Convenience: hash an IP for storage in `referrals.ip_hash`. Exported
 * separately so the webhook can write the same hash that `computeFraudFlags`
 * compared against — keeps the two paths byte-identical.
 */
export function hashReferralIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hashIp(ip);
}

// Suppress an unused-import warning when `sql` is only used implicitly.
void sql;
