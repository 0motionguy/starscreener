/**
 * recent-viewed-repos — small client-only store for the sidebar
 * "Recently Viewed" widget. Writes a deduped, capped, MRU-ordered array
 * of {fullName, owner, name, viewedAt} entries to localStorage when a
 * user lands on /repo/[owner]/[name].
 *
 * Why a hand-rolled module instead of leaning on the existing
 * `lastSeen.<routeKey>` snapshot store (`use-fresh-count.ts`)?
 *
 *   - That store only records ONE count per route key — it's designed
 *     for sidebar fresh-count badges, not a list of items.
 *   - The recent-viewed widget needs an ordered list of distinct repos
 *     with stable identity (owner/name) — semantically different.
 *
 * Storage shape (single key):
 *   localStorage["recentViewedRepos"] = JSON.stringify([
 *     { fullName, owner, name, viewedAt },  // most recent first
 *     ...
 *   ])
 *
 * Cap: 20 entries persisted (cheap to keep extra history without
 * bloating storage). The widget renders the top 5.
 *
 * SSR-safe: every export tolerates `window === undefined` and silent
 * localStorage failures (Safari private mode quota, etc.) — the widget
 * just degrades to "no recent repos".
 */

export interface RecentViewedRepo {
  /** "owner/name" — used as the dedupe key. */
  fullName: string;
  owner: string;
  name: string;
  /** `Date.now()` at the time the user landed on the detail page. */
  viewedAt: number;
}

const STORAGE_KEY = "recentViewedRepos";
const MAX_ENTRIES = 20;

function isValidEntry(value: unknown): value is RecentViewedRepo {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<RecentViewedRepo>;
  return (
    typeof entry.fullName === "string" &&
    entry.fullName.length > 0 &&
    typeof entry.owner === "string" &&
    entry.owner.length > 0 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    typeof entry.viewedAt === "number" &&
    Number.isFinite(entry.viewedAt)
  );
}

/**
 * Read the current list. Returns `[]` during SSR, when the key is
 * missing, or when the stored value is malformed (we'd rather forget
 * the bad entry than blow up the sidebar).
 */
export function readRecentViewedRepos(): RecentViewedRepo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Push a repo to the front of the list. Removes any existing entry
 * with the same `fullName` (case-insensitive) so the list is deduped
 * and MRU-ordered. Caps at MAX_ENTRIES. No-op on SSR or quota error.
 */
export function trackRepoViewed(input: {
  owner: string;
  name: string;
}): void {
  if (typeof window === "undefined") return;
  const owner = input.owner?.trim();
  const name = input.name?.trim();
  if (!owner || !name) return;
  const fullName = `${owner}/${name}`;
  const lowerKey = fullName.toLowerCase();

  try {
    const current = readRecentViewedRepos();
    const filtered = current.filter(
      (r) => r.fullName.toLowerCase() !== lowerKey,
    );
    const next: RecentViewedRepo[] = [
      { fullName, owner, name, viewedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage full / disabled — degrade silently.
  }
}

export const RECENT_VIEWED_REPOS_KEY = STORAGE_KEY;
export const RECENT_VIEWED_REPOS_MAX = MAX_ENTRIES;
