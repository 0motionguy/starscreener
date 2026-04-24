// StarScreener — tier definitions.
//
// Pure data: the commercial surface (pricing page, entitlements helper,
// feature-gating in routes) all reads from this file. Keep it free of
// server-only imports (no node:fs, no DB, no env reads) so the shapes can
// ship to both server and client bundles without a code split.
//
// Honesty contract: if a feature is "coming soon" for a tier, set it to
// `false` here with a TODO. Never paint a feature ON just to sell a tier —
// the entitlements helper returns exactly what this table says.
//
// Versioning: new feature keys land as additive booleans / numerics. Never
// rename a key without a migration — user-tier records reference them by
// key, and downstream reports (MCP usage, billing reconciliation) will
// break silently if the key disappears.

export type UserTier = "free" | "pro" | "team" | "enterprise";

export type BillingCadence = "monthly" | "yearly";

/**
 * Feature flag table for a tier.
 *
 * Numeric limits:
 *   -  0  means "feature is disabled for this tier" (e.g., a tier with zero
 *         alerts). Kept distinct from boolean `false` so comparison in
 *         entitlements.ts can short-circuit on "canCreate" before checking
 *         a numeric cap.
 *   - -1  means "unlimited". Callers MUST treat -1 as the only sentinel
 *         for unlimited; any positive integer is a hard cap.
 */
export interface TierFeatures {
  /** Max alert rules the user can have simultaneously. -1 = unlimited. */
  maxAlertRules: number;
  /** Max webhook destinations configured for alerts. -1 = unlimited. */
  maxWebhookTargets: number;
  /** Max repos in a single watchlist. -1 = unlimited. */
  maxWatchlistRepos: number;
  /**
   * Rate-limit multiplier relative to the free baseline (1x). A pro user
   * with 10x gets 10 times the per-minute budget of an anonymous/free
   * caller. Applied by the rate limiter when it knows the userId's tier.
   */
  rateLimitMultiplier: number;
  /** Download repo / breakouts / collections lists as CSV. */
  csvExport: boolean;
  /** Watchlist is not crawlable / not part of public profile. */
  privateWatchlist: boolean;
  /** Weekly digest email. */
  emailDigest: boolean;
  /** MCP tool-use reports (monthly, per user). */
  mcpUsageReports: boolean;
  /** Shared team workspace with webhooks + watchlists. */
  teamWorkspace: boolean;
  /** SLA-backed support channel. */
  prioritySupport: boolean;
  /** Custom SLA contract. */
  customSlas: boolean;
  /** On-prem feed mirror. */
  onPremFeeds: boolean;
}

export interface TierDefinition {
  /** Stable machine key. Never change once shipped. */
  key: UserTier;
  /** Human-facing display name for the pricing page. */
  displayName: string;
  /** One-line hook shown under the name on the pricing card. */
  tagline: string;
  /**
   * Monthly billing price in USD. `null` for enterprise ("contact sales")
   * and for tiers that are free (prefer `0` over `null` there — `null` is
   * specifically "price is not public").
   */
  priceMonthlyUsd: number | null;
  /** Yearly billing price in USD. Always less than 12x monthly. */
  priceYearlyUsd: number | null;
  /** Seats included in the base price. Team adds seats on top. */
  includedSeats: number;
  /** Additional per-seat price for team ($/seat/mo), or `null` if N/A. */
  extraSeatMonthlyUsd: number | null;
  /** Additional per-seat price for team ($/seat/yr), or `null` if N/A. */
  extraSeatYearlyUsd: number | null;
  /** Minimum seats required to purchase this tier. */
  minSeats: number;
  /** Call-to-action label for the pricing card. */
  ctaLabel: string;
  /** URL path for the CTA. */
  ctaHref: string;
  features: TierFeatures;
}

// -----------------------------------------------------------------------------
// Tier table
// -----------------------------------------------------------------------------

export const TIERS: Record<UserTier, TierDefinition> = {
  free: {
    key: "free",
    displayName: "Free",
    tagline: "Public API, limited alerts, no strings.",
    priceMonthlyUsd: 0,
    priceYearlyUsd: 0,
    includedSeats: 1,
    extraSeatMonthlyUsd: null,
    extraSeatYearlyUsd: null,
    minSeats: 1,
    ctaLabel: "Start free",
    ctaHref: "/",
    features: {
      maxAlertRules: 3,
      maxWebhookTargets: 0,
      maxWatchlistRepos: 5,
      rateLimitMultiplier: 1,
      csvExport: false,
      privateWatchlist: false,
      emailDigest: false,
      mcpUsageReports: false,
      teamWorkspace: false,
      prioritySupport: false,
      customSlas: false,
      onPremFeeds: false,
    },
  },
  pro: {
    key: "pro",
    displayName: "Pro",
    tagline: "For operators shipping with agent signals daily.",
    priceMonthlyUsd: 19,
    priceYearlyUsd: 180,
    includedSeats: 1,
    extraSeatMonthlyUsd: null,
    extraSeatYearlyUsd: null,
    minSeats: 1,
    ctaLabel: "Upgrade to Pro",
    ctaHref: "/pricing#pro",
    features: {
      maxAlertRules: 60,
      maxWebhookTargets: 3,
      maxWatchlistRepos: -1,
      rateLimitMultiplier: 10,
      csvExport: true,
      privateWatchlist: true,
      emailDigest: true,
      // TODO(pricing): mcpUsageReports — wire up after MCP usage logs land.
      mcpUsageReports: false,
      teamWorkspace: false,
      prioritySupport: false,
      customSlas: false,
      onPremFeeds: false,
    },
  },
  team: {
    key: "team",
    displayName: "Team",
    tagline: "Share webhooks, watchlists, and usage reports across the crew.",
    priceMonthlyUsd: 49,
    priceYearlyUsd: 480,
    includedSeats: 3,
    extraSeatMonthlyUsd: 49,
    extraSeatYearlyUsd: 480,
    minSeats: 3,
    ctaLabel: "Start team trial",
    ctaHref: "/pricing#team",
    features: {
      maxAlertRules: -1,
      maxWebhookTargets: -1,
      maxWatchlistRepos: -1,
      rateLimitMultiplier: 25,
      csvExport: true,
      privateWatchlist: true,
      emailDigest: true,
      mcpUsageReports: true,
      teamWorkspace: true,
      prioritySupport: true,
      customSlas: false,
      onPremFeeds: false,
    },
  },
  enterprise: {
    key: "enterprise",
    displayName: "Enterprise",
    tagline: "Custom SLAs, on-prem mirrors, and bulk coverage.",
    priceMonthlyUsd: null,
    priceYearlyUsd: null,
    includedSeats: 10,
    extraSeatMonthlyUsd: null,
    extraSeatYearlyUsd: null,
    minSeats: 10,
    ctaLabel: "Contact sales",
    ctaHref: "mailto:sales@trendingrepo.com?subject=Enterprise%20inquiry",
    features: {
      maxAlertRules: -1,
      maxWebhookTargets: -1,
      maxWatchlistRepos: -1,
      rateLimitMultiplier: 100,
      csvExport: true,
      privateWatchlist: true,
      emailDigest: true,
      mcpUsageReports: true,
      teamWorkspace: true,
      prioritySupport: true,
      customSlas: true,
      onPremFeeds: true,
    },
  },
};

/** Ordered list used by pricing UI — free → enterprise left-to-right. */
export const TIER_ORDER: readonly UserTier[] = ["free", "pro", "team", "enterprise"] as const;

/** Type guard: narrow an unknown string to `UserTier`. */
export function isUserTier(value: unknown): value is UserTier {
  return (
    typeof value === "string" &&
    (value === "free" || value === "pro" || value === "team" || value === "enterprise")
  );
}

/**
 * Resolve a tier definition for a key. Unknown / null / undefined defaults
 * to the free tier — the entitlements helper relies on this being pure so
 * it can be called safely even for anonymous requests.
 */
export function tierFor(key: UserTier | null | undefined): TierDefinition {
  if (!key) return TIERS.free;
  if (!isUserTier(key)) return TIERS.free;
  return TIERS[key];
}

/**
 * Return the effective monthly cost for N seats on a tier. Honors
 * `includedSeats` (seats beyond the base add `extraSeatMonthlyUsd` each).
 * Enterprise / custom-priced tiers return `null`.
 */
export function monthlyCostForSeats(tier: UserTier, seats: number): number | null {
  const def = tierFor(tier);
  if (def.priceMonthlyUsd === null) return null;
  const clampedSeats = Math.max(def.minSeats, Math.floor(seats));
  if (clampedSeats <= def.includedSeats) return def.priceMonthlyUsd;
  const extra = clampedSeats - def.includedSeats;
  const perSeat = def.extraSeatMonthlyUsd ?? 0;
  return def.priceMonthlyUsd + extra * perSeat;
}
