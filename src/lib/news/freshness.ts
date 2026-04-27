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
  | "mcp"
  | "skills"
  | "npm";

export type FreshnessStatus = "live" | "warn" | "cold";

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
  mcp: FAST_DATA_STALE_THRESHOLD_MS,
  skills: FAST_DATA_STALE_THRESHOLD_MS,
  // Twitter freshness is reported through the scan-ingestion system, not
  // a JSON file — the page passes its own age in directly. Default to
  // the fast threshold so a missing twitter timestamp behaves like a
  // missing reddit one.
  twitter: FAST_DATA_STALE_THRESHOLD_MS,
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
 */
export function classifyFreshness(
  source: NewsSource,
  fetchedAt: string | null | undefined,
  nowMs: number = Date.now(),
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

  const ageMs = Math.max(0, nowMs - ts);
  const status: FreshnessStatus =
    ageMs > staleAfterMs
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
): boolean {
  return classifyFreshness(source, fetchedAt, nowMs).status === "cold";
}
