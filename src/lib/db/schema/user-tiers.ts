// Drizzle schema — `user_tiers` table.
//
// Durable home for the userId → paid-tier mapping (Stripe entitlements).
// Replaces the `.data/user-tiers.jsonl` file store as the production
// backend: the Docker runner stage ships no `.data/` volume, so JSONL
// tier records evaporated on every redeploy — a paying customer would
// silently drop to free. Postgres survives deploys; the JSONL store
// remains the dev/CI fallback (see src/lib/pricing/user-tiers.ts).
//
// Keyed by the STRING userId (not a profiles FK) on purpose:
//   - the canonical key is `c_<clerkUserId>` (lib/auth/user-id), but the
//     Stripe webhook writes whatever id checkout pinned in metadata —
//     during migration windows that can include legacy `u_<hmac(email)>`
//     rows, which must remain storable;
//   - the webhook must be able to record a tier even if the profile row
//     hasn't landed yet (Clerk webhook lag).
//
// Shape mirrors UserTierRecord in src/lib/pricing/user-tiers.ts 1:1 so
// the store facade can swap backends without any caller changes.

import { sql } from "drizzle-orm";
import { index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { tr } from "./_schema";
import { profiles } from "./profiles";

export const userTiers = tr.table(
  "user_tiers",
  {
    /** Canonical `c_<clerkUserId>` (or legacy `u_<hmac>`) — see lib/auth/user-id. */
    userId: text("user_id").primaryKey(),
    /**
     * Canonical relational owner: the profile UUID. NULLABLE during transition
     * — webhook-lag rows and legacy `u_<hmac>` rows may not resolve to a
     * profile yet — but new billing writes should populate it, and the
     * unique-where-non-null index below keeps at most one tier row per profile.
     * Backfilled from `c_<clerkUserId>` → `profiles.clerk_user_id` (see
     * scripts/backfill-user-tier-profiles.ts). onDelete: set null keeps the
     * Stripe ids for accounting if a profile is ever hard-deleted.
     */
    profileId: uuid("profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    /** 'free' | 'pro' | 'team' | 'enterprise' — validated in the store layer. */
    tier: text("tier").notNull(),
    /** Entitlement expiry (Stripe current_period_end); null = no expiry. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Billing-portal lookups + Stripe-support cross-referencing.
    index("user_tiers_stripe_customer_idx").on(table.stripeCustomerId),
    // At most one tier row per profile — but only where profile_id is set, so
    // transitional NULL rows (webhook lag / legacy u_) don't collide.
    uniqueIndex("user_tiers_profile_id_uniq")
      .on(table.profileId)
      .where(sql`${table.profileId} is not null`),
  ],
);

export type UserTierRow = typeof userTiers.$inferSelect;
export type NewUserTierRow = typeof userTiers.$inferInsert;
