// TrendingRepo — daily digest queries.
//
// Reads the current trending snapshot through the data-store path
// (refreshTrendingFromStore() then sync getters) and projects it to the
// DigestEntry/DigestData shape consumed by /digest and /digest/[date].
//
// HISTORICAL DATA AVAILABILITY (architectural note)
// -------------------------------------------------
// The committed `data/trending.json` + Redis `ss:data:v1:trending` payload
// hold a single live snapshot keyed by `fetchedAt` — there is no per-date
// archive on the data-store side, and `getDerivedRepos()` only ever sees
// the latest pass. We therefore ship `/digest/[date]` as a TODAY-ONLY
// surface for now: the only resolvable date is the UTC date stamp of the
// current trending fetch. Any other date returns `null`, which the
// `[date]/page.tsx` route maps to `notFound()`.
//
// To unlock real historical digests the collector job needs to write a
// dated key (e.g. `ss:data:v1:trending:2026-04-28`) on every successful
// scrape, plus a small index key listing available dates. That is a
// follow-up — out of scope for this round.
//
// All reads go through `refreshTrendingFromStore()` per STARSCREENER's
// "data reads MUST go through the data-store" rule. `getDerivedRepos()`
// is the canonical sync facade that consumes whatever the in-memory
// trending cache holds after the refresh.

import { CATEGORIES } from "@/lib/constants";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";

export interface DigestEntry {
  rank: number;
  fullName: string; // "owner/name"
  description: string;
  stars: number;
  starsDelta24h: number;
  language: string | null;
  category: string | null;
  momentumScore: number | null;
}

export interface DigestData {
  date: string; // "YYYY-MM-DD"
  entries: DigestEntry[];
  totalRepos: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Public — used by callers that want to validate before invoking the loaders. */
export function isValidDigestDate(date: string): boolean {
  return DATE_RE.test(date);
}

/**
 * UTC date stamp of the current trending fetch — used as the canonical
 * "today" key. We pull from `lastFetchedAt` rather than `Date.now()` so a
 * stale Lambda still serves a stable URL that matches the data it just
 * rendered. Falls back to the current UTC day if `fetchedAt` is missing
 * or unparseable (e.g. fresh local dev with seed data).
 */
function getCurrentDigestDate(): string {
  try {
    const fetchedAt = getLastFetchedAt();
    const d = new Date(fetchedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // Fall through.
  }
  return new Date().toISOString().slice(0, 10);
}

// One-shot map for category-id → display name. CATEGORIES is a static
// constant array; building the index once at module load is cheap and
// avoids a linear .find() per repo on every digest render.
const CATEGORY_NAME_BY_ID: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of CATEGORIES) m.set(c.id, c.name);
  return m;
})();

function buildDigestData(date: string): DigestData {
  // getDerivedRepos() reads whatever the in-memory trending cache holds
  // after the refresh hook ran in the caller.
  let repos: ReturnType<typeof getDerivedRepos> = [];
  try {
    repos = getDerivedRepos();
  } catch {
    // Defensive: getDerivedRepos throws on truly broken seeds. Empty list
    // is preferable to a 500 on a degraded deploy — the index page already
    // handles the empty case.
    repos = [];
  }
  const sorted = [...repos].sort(
    (a, b) => b.starsDelta24h - a.starsDelta24h,
  );
  const entries: DigestEntry[] = sorted.map((r, i) => ({
    rank: i + 1,
    fullName: r.fullName,
    description: r.description ?? "",
    stars: r.stars,
    starsDelta24h: r.starsDelta24h,
    language: r.language ?? null,
    category: CATEGORY_NAME_BY_ID.get(r.categoryId) ?? null,
    momentumScore:
      typeof r.momentumScore === "number" ? r.momentumScore : null,
  }));
  return {
    date,
    entries,
    totalRepos: entries.length,
  };
}

/** Returns today's digest — a snapshot of current trending repos. */
export async function getTodayDigest(): Promise<DigestData> {
  try {
    await refreshTrendingFromStore();
  } catch {
    // Refresh is best-effort; sync getters serve whatever the cache holds.
  }
  const date = getCurrentDigestDate();
  return buildDigestData(date);
}

/**
 * Returns digest for a specific date. Returns null if no data for that
 * date. Today-only for now (see file header note).
 */
export async function getDigestForDate(
  date: string,
): Promise<DigestData | null> {
  if (!isValidDigestDate(date)) return null;
  try {
    await refreshTrendingFromStore();
  } catch {
    // Best-effort.
  }
  const today = getCurrentDigestDate();
  if (date !== today) return null;
  try {
    return buildDigestData(date);
  } catch {
    return null;
  }
}

/**
 * Lists all dates that have a digest available (for sitemap + index page).
 * Today-only for now (see file header note).
 */
export async function listAvailableDigestDates(): Promise<string[]> {
  try {
    await refreshTrendingFromStore();
  } catch {
    // Best-effort.
  }
  const today = getCurrentDigestDate();
  return [today];
}
