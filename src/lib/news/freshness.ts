// News-page freshness helpers. Wraps the global thresholds in
// src/lib/source-health.ts so every news page agrees on what "live",
// "stale", and "cold" mean — and so the user-facing copy ("LIVE · 17m")
// is built in exactly one place.
//
// Per the redesign spec: a source past its STALE threshold is treated as
// "cold" and the page hides the data entirely (SourceDownEmptyState).
// Sources still within the threshold are "live" if fresh-fresh and
// "stale-leaning" if past the soft warn threshold.

import {
  DEVTO_STALE_THRESHOLD_MS,
  FAST_DATA_STALE_THRESHOLD_MS,
  NPM_STALE_THRESHOLD_MS,
  PRODUCTHUNT_STALE_THRESHOLD_MS,
} from "@/lib/source-health";

export type NewsSource =
  | "reddit"
  | "hackernews"
  | "bluesky"
  | "devto"
  | "lobsters"
  | "producthunt"
  | "twitter"
  | "npm"
  | "mcp"
  | "skills";

export type FreshnessStatus = "live" | "warn" | "cold";

const TWITTER_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

/**
 * Mapping from NewsSource → stale threshold in ms. We treat the *stale*
 * threshold as the cold cutoff: past it, the page renders the
 * "source down" empty state and hides data entirely.
 *
 * The numbers are imported from source-health.ts so anyone editing a
 * cadence in one place picks it up here automatically.
 */
export const SOURCE_STALE_MS: Record<NewsSource, number> = {
  reddit: FAST_DATA_STALE_THRESHOLD_MS,
  hackernews: FAST_DATA_STALE_THRESHOLD_MS,
  bluesky: FAST_DATA_STALE_THRESHOLD_MS,
  lobsters: FAST_DATA_STALE_THRESHOLD_MS,
  devto: DEVTO_STALE_THRESHOLD_MS,
  producthunt: PRODUCTHUNT_STALE_THRESHOLD_MS,
  npm: NPM_STALE_THRESHOLD_MS,
  // Twitter freshness is reported through the scan-ingestion system, not a
  // fast JSON scraper. Its collector runs on a slower 3h cadence, so use the
  // 12h scan budget instead of the fast-source 4h cutoff.
  twitter: TWITTER_STALE_THRESHOLD_MS,
  // MCP + Skills publish from the worker fleet on a 6h cadence (12h budget
  // = 6h cron + 6h grace). Reuse the npm threshold since it's the closest
  // existing match for slow-cron Redis-published feeds.
  mcp: NPM_STALE_THRESHOLD_MS,
  skills: NPM_STALE_THRESHOLD_MS,
};

/** Soft warn threshold = 50% of the stale threshold. Past it the badge
 * goes amber but the page still renders data; past the stale threshold
 * the page hides data entirely. */
function warnMs(staleMs: number): number {
  return Math.floor(staleMs / 2);
}

/**
 * Pretty-print a millisecond age as "17m" / "4h" / "2d" / "live".
 * Returns "—" when the age is null/undefined so the UI never shows NaN.
 */
export function formatScrapeAge(ageMs: number | null | undefined): string {
  if (ageMs === null || ageMs === undefined || !Number.isFinite(ageMs)) {
    return "—";
  }
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return "live";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export interface FreshnessVerdict {
  /** ms since the source's last successful scrape. null → never scraped. */
  ageMs: number | null;
  /** Pretty form for display. */
  ageLabel: string;
  /** "live" green | "warn" amber | "cold" → page hides data. */
  status: FreshnessStatus;
  /** Threshold ms the source must beat to avoid being treated as cold. */
  staleAfterMs: number;
}

/**
 * Classify a source's freshness given its last `fetchedAt`. Used by
 * `NewsSourceLayout` to decide between rendering the page and rendering
 * the SourceDown empty state.
 *
 * @param oldestRecordAt Optional ISO of the OLDEST per-record `lastRefreshedAt`
 *   in the payload. When passed, freshness uses
 *   `max(now - fetchedAt, now - oldestRecordAt)` so a cron that emits stale
 *   data with a fresh top-level timestamp still trips the badge. When the
 *   oldest record is past `cadence × 2` (i.e. 2× the stale threshold) the
 *   badge is forced to STALE/cold regardless of fetchedAt.
 *
 *   Sources that don't track per-record state pass `undefined` and keep the
 *   old fetchedAt-only behavior. Pre-existing callers stay green.
 */
export function classifyFreshness(
  source: NewsSource,
  fetchedAt: string | null | undefined,
  nowMs: number = Date.now(),
  oldestRecordAt?: string | null | undefined,
): FreshnessVerdict {
  const staleAfterMs = SOURCE_STALE_MS[source];

  if (!fetchedAt) {
    return {
      ageMs: null,
      ageLabel: "—",
      status: "cold",
      staleAfterMs,
    };
  }

  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) {
    return {
      ageMs: null,
      ageLabel: "—",
      status: "cold",
      staleAfterMs,
    };
  }

  const fetchedAge = Math.max(0, nowMs - ts);

  // Optional per-record floor. Only applied when caller provided a parseable
  // oldestRecordAt — undefined / null / unparseable → fall through to the
  // old fetchedAt-only path.
  let oldestAge: number | null = null;
  if (oldestRecordAt) {
    const oldestTs = Date.parse(oldestRecordAt);
    if (Number.isFinite(oldestTs)) {
      oldestAge = Math.max(0, nowMs - oldestTs);
    }
  }

  const ageMs = oldestAge !== null ? Math.max(fetchedAge, oldestAge) : fetchedAge;

  // Hard force-cold when the oldest record is past 2× the stale threshold.
  // This catches the silent-emit-same-data failure mode that motivated B4:
  // top-level fetchedAt advances every 20m but the underlying records are
  // hours old. cadence × 2 = STALE_THRESHOLD × 2 since the stale threshold
  // is already cron-cadence × grace.
  const oldestForcesCold = oldestAge !== null && oldestAge > staleAfterMs * 2;

  const status: FreshnessStatus = oldestForcesCold
    ? "cold"
    : ageMs > staleAfterMs
      ? "cold"
      : ageMs > warnMs(staleAfterMs)
        ? "warn"
        : "live";

  return {
    ageMs,
    ageLabel: formatScrapeAge(ageMs),
    status,
    staleAfterMs,
  };
}

/**
 * True if the source should hide its data entirely (cold). Convenience
 * wrapper around classifyFreshness() for callers that don't need the
 * other fields.
 */
export function isSourceCold(
  source: NewsSource,
  fetchedAt: string | null | undefined,
  nowMs: number = Date.now(),
  oldestRecordAt?: string | null | undefined,
): boolean {
  return classifyFreshness(source, fetchedAt, nowMs, oldestRecordAt).status === "cold";
}

/**
 * Walk a payload and find the oldest `lastRefreshedAt` ISO string anywhere
 * in nested objects/arrays. Returns null when nothing is stamped.
 *
 * Used by source loaders to pass an oldestRecordAt floor into classifyFreshness
 * — see `scripts/_data-store-write.mjs` (the writer that stamps tracked-repo
 * records) for the producer side. Bounded recursion (depth 6) so a malformed
 * payload can't infinite-loop the loader.
 */
export function findOldestRecordAt(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  let oldest: string | null = null;
  let oldestTs = Number.POSITIVE_INFINITY;

  const considerCandidate = (candidate: unknown): void => {
    if (typeof candidate !== "string") return;
    const ts = Date.parse(candidate);
    if (!Number.isFinite(ts)) return;
    if (ts < oldestTs) {
      oldestTs = ts;
      oldest = candidate;
    }
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      const child = findOldestRecordAt(item, depth + 1);
      considerCandidate(child);
    }
    return oldest;
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.lastRefreshedAt === "string") {
    considerCandidate(obj.lastRefreshedAt);
  }
  for (const child of Object.values(obj)) {
    if (child === null || typeof child !== "object") continue;
    const found = findOldestRecordAt(child, depth + 1);
    considerCandidate(found);
  }
  return oldest;
}
