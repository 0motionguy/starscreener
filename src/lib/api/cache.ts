// Shared cache-header constants for read endpoints (APP-09).
//
// Four named profiles cover every read path. Pick the tightest one
// that works for your data; routes needing bespoke freshness should
// add a profile here rather than inline a fifth Cache-Control string.
//
//   READ_FAST   (s-maxage=30,  swr=60)    — repo profiles, mentions, deltas;
//                                            data refreshes every cron tick.
//   READ_MEDIUM (s-maxage=60,  swr=300)   — per-repo freshness windows where
//                                            seconds matter less but minutes
//                                            do (5min cap on stale).
//   READ_SLOW   (s-maxage=300, swr=3600)  — calibration histograms, GitHub
//                                            compare overlays — content
//                                            barely moves.
//   READ_HEAVY  (s-maxage=3600, swr=86400) — OpenAPI / manifests; 1h fresh,
//                                             1d stale, refreshes only on
//                                             deploy.

export const READ_FAST_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

export const READ_MEDIUM_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export const READ_SLOW_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
} as const;

export const READ_HEAVY_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

/**
 * Backwards-compatible alias for the original single export. Existing
 * imports keep working; new callers should pick a named profile.
 *
 * @deprecated use READ_FAST_HEADERS (or another named profile) directly.
 */
export const READ_CACHE_HEADERS = READ_FAST_HEADERS;
