// Stale-threshold constants extracted from source-health.ts so client
// components (e.g. FreshnessBadge via news/freshness.ts) can import them
// without dragging the server-only data loaders along.
//
// Edit values here; source-health.ts re-exports them so server callers
// see the same numbers without further changes.

/** Fast-cron data sources (HN/Bluesky/Lobsters): 4h budget. */
export const FAST_DATA_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

/** ProductHunt: 16h budget (slower cadence). */
export const PRODUCTHUNT_STALE_THRESHOLD_MS = 16 * 60 * 60 * 1000;

/** Dev.to: 28h budget (24h collector cadence + 4h grace to absorb GH Actions queue churn, matches FAST_DATA safety margin). */
export const DEVTO_STALE_THRESHOLD_MS = 28 * 60 * 60 * 1000;

/** npm: 50h budget. */
export const NPM_STALE_THRESHOLD_MS = 50 * 60 * 60 * 1000;
