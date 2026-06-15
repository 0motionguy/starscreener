/**
 * Public-staleness gate — "no publicly stale batches" rule.
 *
 * Any homepage-rendered dataset older than `MAX_PUBLIC_STALENESS_MIN`
 * (default 30min) should NOT be rendered as a normal row. The component
 * renders a "data refreshing" banner or an empty/degraded state instead.
 *
 * The threshold defaults are conservative — most fetchers publish hourly,
 * so 30min is the "we missed at most one tick" line. Override per-deploy
 * with `NEXT_PUBLIC_MAX_PUBLIC_STALENESS_MIN` (still client-readable since
 * stale UI is visible to anyone).
 */

const DEFAULT_MAX_PUBLIC_STALENESS_MIN = 30;

function maxPublicStalenessMin(): number {
  const raw = process.env.NEXT_PUBLIC_MAX_PUBLIC_STALENESS_MIN;
  if (!raw) return DEFAULT_MAX_PUBLIC_STALENESS_MIN;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_PUBLIC_STALENESS_MIN;
  return parsed;
}

export interface PublicStalenessVerdict {
  /** True when the data is within the publicly-acceptable freshness window. */
  isFresh: boolean;
  /** Age in milliseconds. Infinity when timestamp is missing/invalid. */
  ageMs: number;
  /** Configured freshness threshold in milliseconds. */
  thresholdMs: number;
}

export function classifyPublicStaleness(
  lastUpdatedAt: string | number | Date | null | undefined,
  nowMs: number = Date.now(),
): PublicStalenessVerdict {
  const thresholdMs = maxPublicStalenessMin() * 60 * 1000;
  if (lastUpdatedAt === null || lastUpdatedAt === undefined) {
    return { isFresh: false, ageMs: Number.POSITIVE_INFINITY, thresholdMs };
  }
  let ts: number;
  if (lastUpdatedAt instanceof Date) {
    ts = lastUpdatedAt.getTime();
  } else if (typeof lastUpdatedAt === "number") {
    ts = lastUpdatedAt;
  } else {
    ts = Date.parse(lastUpdatedAt);
  }
  if (!Number.isFinite(ts)) {
    return { isFresh: false, ageMs: Number.POSITIVE_INFINITY, thresholdMs };
  }
  const ageMs = Math.max(0, nowMs - ts);
  return { isFresh: ageMs <= thresholdMs, ageMs, thresholdMs };
}
