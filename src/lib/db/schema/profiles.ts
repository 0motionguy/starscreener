// Drizzle schema — `profiles` table.
//
// Single source of truth for user identity + email preferences. Backed by
// Supabase Postgres; populated via the Clerk `user.created` webhook handler
// and refreshed on `user.updated`. The `clerk_user_id` is the unique key
// our app uses to look up a profile from a Clerk session token at runtime.
//
// Column groups:
//   - identity:    id, clerk_user_id, handle, email, display_name, avatar_url
//   - role:        'user' | 'operator' | 'admin' | 'founder'
//   - timestamps:  created_at, last_seen_at, deleted_at (soft delete)
//   - email prefs: email_alerts_cadence (default 'daily'), email_*, quiet_hours, timezone
//   - referrals:   referral_credits (counter, NOT convertible to paid time),
//                  dismissed_invite_banner_at, public_leaderboard_optin
//   - mcp:         mcp_token_hash + mcp_token_last4 for the read-only
//                  "list_my_alerts" MCP token a user can issue from /you/alerts
//
// IMPORTANT: `referral_credits` is a pure counter for milestone math.
// Its UI surface MUST NEVER imply convertibility to dollars or paid time —
// that promise was explicitly cut from v1 (see plan: "Don't promise
// convertibility — badges only").

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tr } from "./_schema";

export const profiles = tr.table(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identity (sourced from Clerk + reserved at signup)
    clerkUserId: text("clerk_user_id").notNull(),
    handle: text("handle").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),

    // Role flag — 'user' default, 'operator' on 5+ qualified referrals,
    // 'admin' (manual), 'founder' (25+ qualified referrals).
    role: text("role").notNull().default("user"),

    // Lifecycle
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    // Email preferences — defaults are intentionally conservative
    // ('daily' digest, no product updates) to minimise spam complaints
    // when alert volume picks up.
    emailAlertsCadence: text("email_alerts_cadence")
      .notNull()
      .default("daily"), // 'realtime' | 'daily' | 'weekly' | 'off'
    emailReferralUpdates: boolean("email_referral_updates").notNull().default(true),
    emailProductUpdates: boolean("email_product_updates").notNull().default(false),
    emailSystem: boolean("email_system").notNull().default(true),
    quietHours: jsonb("quiet_hours"), // { startMin: 0..1439, endMin: 0..1439 } | null
    timezone: text("timezone").notNull().default("UTC"),

    // Referral state. Counter is updated atomically by the qualify cron.
    referralCredits: integer("referral_credits").notNull().default(0),
    dismissedInviteBannerAt: timestamp("dismissed_invite_banner_at", {
      withTimezone: true,
    }),
    publicLeaderboardOptin: boolean("public_leaderboard_optin")
      .notNull()
      .default(false),

    // MCP read-only token (issued from /you/alerts). Plaintext shown once;
    // we store the bcrypt hash + last 4 chars for UI display.
    mcpTokenHash: text("mcp_token_hash"),
    mcpTokenLast4: text("mcp_token_last4"),
  },
  (t) => [
    uniqueIndex("profiles_clerk_user_id_uniq").on(t.clerkUserId),
    uniqueIndex("profiles_handle_uniq").on(t.handle),
    // Case-insensitive handle lookup for `/u/<handle>` routes.
    uniqueIndex("profiles_handle_lower_uniq").on(sql`lower(${t.handle})`),
    index("profiles_email_idx").on(t.email),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

/**
 * Allowed values for `profiles.email_alerts_cadence`. Mirrors the
 * application's runtime check; keep in sync if a value is added.
 */
export const EMAIL_ALERTS_CADENCES = [
  "realtime",
  "daily",
  "weekly",
  "off",
] as const;
export type EmailAlertsCadence = (typeof EMAIL_ALERTS_CADENCES)[number];

/**
 * Allowed values for `profiles.role`. 'operator' is auto-granted at the
 * 5-qualified-referral milestone; 'founder' at 25; 'admin' is manual.
 */
export const PROFILE_ROLES = ["user", "operator", "admin", "founder"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];
