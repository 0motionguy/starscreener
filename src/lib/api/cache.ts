// Shared cache-header constants for read endpoints.
//
// The pipeline recomputes on cron (hourly / 6h / 24h depending on tier), so
// a 30s edge cache + 60s stale-while-revalidate is safe and dramatically
// cuts origin load during traffic spikes. Individual routes may override
// when they need tighter freshness.

export const READ_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;
