// StarScreener — feature-flag entitlements.
//
// Single source of truth that a route handler calls to decide "can this
// userId use this feature?". The tier definitions in ./tiers provide the
// flag table; this module composes that with the user-tier store to
// answer the question per-request.
//
// Default-deny contract: anything we don't understand returns `false`. The
// cost of an honest "no" is a 402 upsell; the cost of an accidental "yes"
// is a revenue leak. We always pick the honest "no".
//
// Hot-path notes:
//   - `getUserTier` is mtime-cached so the typical call is O(1).
//   - `canUseFeature(null, ...)` short-circuits without touching the store.
//   - Unknown feature keys throw in dev (via an exhaustive switch) so a
//     typo in a route handler can't silently unlock a feature. In prod
//     the same path returns `false` via the default branch.

import { getUserTier } from "./user-tiers";
import { tierFor, type UserTier } from "./tiers";

/**
 * Feature keys addressable by routes / UI. Keep alphabetized inside each
 * group so diffs that add new keys are easy to review.
 *
 * New features: add the key here, wire the flag into `TierFeatures`, fill
 * every tier row in `TIERS`, and add a test case that asserts the
 * expected pass/fail per tier.
 */
export type FeatureKey =
  | "alerts.create"
  | "alerts.max"
  | "webhooks.create"
  | "webhooks.max"
  | "watchlist.max"
  | "csv.export"
  | "watchlist.private"
  | "digest.email"
  | "mcp.usage-reports"
  | "team.workspace"
  | "support.priority";

/**
 * Boolean gate. Returns `true` when the tier grants the feature in at
 * least a minimal form (for numeric features, "> 0" OR "unlimited").
 */
export async function canUseFeature(
  userId: string | null | undefined,
  key: FeatureKey,
): Promise<boolean> {
  const tier = await resolveTierOrFree(userId);
  return tierCanUseFeature(tier, key);
}

/**
 * Synchronous version that operates on a tier key instead of a userId.
 * Useful when a route has already resolved the tier during auth and wants
 * to avoid a second disk stat.
 */
export function tierCanUseFeature(tier: UserTier, key: FeatureKey): boolean {
  const features = tierFor(tier).features;
  switch (key) {
    case "alerts.create":
      return features.maxAlertRules === -1 || features.maxAlertRules > 0;
    case "alerts.max":
      // Boolean interpretation: "can this tier have any alerts at all?"
      return features.maxAlertRules !== 0;
    case "webhooks.create":
      return features.maxWebhookTargets === -1 || features.maxWebhookTargets > 0;
    case "webhooks.max":
      return features.maxWebhookTargets !== 0;
    case "watchlist.max":
      return features.maxWatchlistRepos !== 0;
    case "csv.export":
      return features.csvExport;
    case "watchlist.private":
      return features.privateWatchlist;
    case "digest.email":
      return features.emailDigest;
    case "mcp.usage-reports":
      return features.mcpUsageReports;
    case "team.workspace":
      return features.teamWorkspace;
    case "support.priority":
      return features.prioritySupport;
    default: {
      // Exhaustiveness guard — TS will flag missing cases at build.
      const _never: never = key;
      void _never;
      return false;
    }
  }
}

/**
 * Numeric cap for a countable feature. Returns `-1` for unlimited. The
 * three exposed keys are the only ones where "limit" is meaningful — the
 * rest are pure booleans.
 *
 * Use this when the route has to enforce a ceiling (e.g., reject a 61st
 * alert on Pro). For a pure boolean check, use `canUseFeature`.
 */
export async function featureLimit(
  userId: string | null | undefined,
  key: "alerts.max" | "webhooks.max" | "watchlist.max",
): Promise<number> {
  const tier = await resolveTierOrFree(userId);
  return tierFeatureLimit(tier, key);
}

export function tierFeatureLimit(
  tier: UserTier,
  key: "alerts.max" | "webhooks.max" | "watchlist.max",
): number {
  const features = tierFor(tier).features;
  switch (key) {
    case "alerts.max":
      return features.maxAlertRules;
    case "webhooks.max":
      return features.maxWebhookTargets;
    case "watchlist.max":
      return features.maxWatchlistRepos;
    default: {
      const _never: never = key;
      void _never;
      return 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveTierOrFree(
  userId: string | null | undefined,
): Promise<UserTier> {
  if (!userId) return "free";
  try {
    return await getUserTier(userId);
  } catch {
    // Default-deny on any lookup failure — treat as free tier.
    return "free";
  }
}
