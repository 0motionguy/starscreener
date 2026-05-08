// Drizzle schema — `referral_codes` + `referrals` + `referral_milestones`.
//
// Pipeline:
//
//   1. Clerk webhook `user.created` → `reserveCodeFromHandle()` writes a
//      row in `referral_codes` (URL-safe handle if available, else a
//      base32 hash prefix).
//   2. Visitor lands on `/?ref=<code>` → middleware sets signed
//      `tr_ref` cookie (30-day, first-touch wins).
//   3. Visitor signs up → `user.created` webhook reads cookie OR Clerk
//      `unsafeMetadata.trRef` → inserts `referrals` row with
//      `signed_up_at = now()` and computed fraud_flags.
//   4. Hourly cron `/api/cron/referrals/qualify` finds rows where the
//      referred user has been seen ≥24h after signup, sets `qualified_at`,
//      increments `profiles.referral_credits`, and runs the milestone
//      evaluator (badges-only — no convertibility promise).
//
// The `referrals.referred_profile_id` partial-unique-where-not-null
// index guarantees one credit per referred user even if they sign up
// twice (different sessions, same Clerk account → same profile id).

import { sql } from "drizzle-orm";
import {
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tr } from "./_schema";
import { profiles } from "./profiles";

// ---------------------------------------------------------------------------
// referral_codes — one row per profile, immutable after creation.
// ---------------------------------------------------------------------------

export const referralCodes = tr.table(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_codes_profile_uniq").on(t.profileId),
    uniqueIndex("referral_codes_code_uniq").on(t.code),
    // Case-insensitive lookup so `?ref=Mirko` and `?ref=mirko` both
    // resolve to the same code row.
    uniqueIndex("referral_codes_code_lower_uniq").on(sql`lower(${t.code})`),
  ],
);

export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;

// ---------------------------------------------------------------------------
// referrals — one row per (referrer, referred) pair. `referred_profile_id`
// is null at click time, populated at signup time.
// ---------------------------------------------------------------------------

export const referrals = tr.table(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerProfileId: uuid("referrer_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Set once the referred user signs up. Null = click-only attribution.
    referredProfileId: uuid("referred_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" },
    ),
    referralCode: text("referral_code").notNull(),

    // Milestones — populated as the referral progresses.
    clickedAt: timestamp("clicked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    signedUpAt: timestamp("signed_up_at", { withTimezone: true }),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),

    // Attribution context, captured at click time from the cookie.
    firstLandingUrl: text("first_landing_url"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"), // sha256 of forwarded IP — fraud signal

    // Fraud signals — array of strings. v1 logs only; admin sweep
    // approves/rejects manually. Possible values:
    //   'same_clerk_user'    — auto-blocked (no row insert)
    //   'same_ip_24h'        — same IP within 24h window
    //   'same_email_domain'  — same non-free email domain
    //   'fast_signup'        — click-to-signup < 10s
    //   'never_returned'     — referred user never came back
    //   'admin_rejected'     — set by /admin/referrals reject action
    fraudFlags: text("fraud_flags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One reward per referred user — partial-unique so click-only rows
    // (referred_profile_id IS NULL) can stack while signup-completed
    // rows are unique. drizzle-orm doesn't support .where() on a
    // unique index in v0.36 yet; use the SQL-level expression to express
    // it explicitly.
    uniqueIndex("referrals_referred_uniq")
      .on(t.referredProfileId)
      .where(sql`${t.referredProfileId} IS NOT NULL`),
    index("referrals_referrer_qualified_idx").on(
      t.referrerProfileId,
      t.qualifiedAt,
    ),
    index("referrals_ip_recent_idx").on(t.ipHash, t.createdAt),
    index("referrals_code_idx").on(t.referralCode),
  ],
);

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;

export const REFERRAL_FRAUD_BLOCKING = ["same_clerk_user", "admin_rejected"] as const;
export type ReferralFraudBlockingFlag =
  (typeof REFERRAL_FRAUD_BLOCKING)[number];

// ---------------------------------------------------------------------------
// referral_milestones — insert-once gate that idempotently records a
// milestone unlock. The qualifier cron runs `evaluateMilestones(credits)`
// after each successful credit increment and INSERTs all earned rows
// with ON CONFLICT DO NOTHING. Newly-inserted rows trigger the
// milestone-reached email + role/badge updates.
// ---------------------------------------------------------------------------

export const referralMilestones = tr.table(
  "referral_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    milestoneKey: text("milestone_key").notNull(), // 'connector'|'operator'|'founder'
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_milestones_uniq").on(t.profileId, t.milestoneKey),
    index("referral_milestones_profile_idx").on(t.profileId),
  ],
);

export const REFERRAL_MILESTONE_KEYS = [
  "connector",
  "operator",
  "founder",
] as const;
export type ReferralMilestoneKey = (typeof REFERRAL_MILESTONE_KEYS)[number];

/**
 * Threshold table — checked against `profiles.referral_credits` after
 * each qualifying-cron increment. Edit here to retune the program.
 *
 * NOTE: `connector` is the entry-level badge. `operator` ALSO upgrades
 * `profiles.role` from 'user' to 'operator'. `founder` includes a
 * Discord invite (FOUNDER_DISCORD_INVITE env var) in the unlock email.
 */
export const REFERRAL_MILESTONE_THRESHOLDS: ReadonlyArray<{
  key: ReferralMilestoneKey;
  threshold: number;
}> = [
  { key: "connector", threshold: 1 },
  { key: "operator", threshold: 5 },
  { key: "founder", threshold: 25 },
];

export type ReferralMilestoneRow = typeof referralMilestones.$inferSelect;
export type NewReferralMilestoneRow = typeof referralMilestones.$inferInsert;
