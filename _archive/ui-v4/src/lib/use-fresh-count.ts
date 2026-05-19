"use client";

/**
 * useFreshCount — client hook for "new since last visit" sidebar badges.
 *
 * Pattern:
 *   - When a user visits a route page (e.g. /skills), the page mounts a
 *     `<MarkVisited routeKey="skills" count={n} />` component which writes
 *     `localStorage["lastSeen.skills"] = n` and
 *     `localStorage["lastSeen.skills.at"] = Date.now()`.
 *   - The sidebar reads each route's current snapshot count (from
 *     `SidebarSourceCounts`) and asks `useFreshCount("skills", current)`
 *     for the delta. If `current > stored`, the hook returns `+(N)` as a
 *     "delta" badge. Otherwise it returns the cumulative total.
 *
 * The "timestamp > lastSeen" semantic in the task spec maps onto
 * snapshot-count diffs because every payload our sidebar surfaces is a
 * point-in-time count — increases between visits ARE the new items by
 * definition. We also stamp `${key}.at` with Date.now() so observers can
 * tell when the user last visited the route, even if the count didn't
 * change.
 *
 * SSR-safe: hooks return `null` during SSR / first render and only read
 * localStorage after mount. This keeps the server-rendered HTML stable.
 */

import { useEffect, useState } from "react";

const KEY_PREFIX = "lastSeen";

function lastSeenKey(routeKey: string): string {
  return `${KEY_PREFIX}.${routeKey}`;
}

function lastSeenAtKey(routeKey: string): string {
  return `${KEY_PREFIX}.${routeKey}.at`;
}

/**
 * Read the stored last-seen count for a route. Returns 0 when nothing
 * has been recorded (first visit) or when localStorage is unavailable.
 */
export function readLastSeen(routeKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(lastSeenKey(routeKey));
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Write the current count + a Date.now() stamp to localStorage. Called
 * when the user visits a route page. Silently no-ops in SSR or when
 * localStorage throws (Safari private mode quota, etc.).
 */
export function markVisited(routeKey: string, count: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(count) || count < 0) return;
  try {
    window.localStorage.setItem(lastSeenKey(routeKey), String(count));
    window.localStorage.setItem(lastSeenAtKey(routeKey), String(Date.now()));
  } catch {
    // localStorage can be unavailable (e.g. iOS private mode quota).
    // The badge silently degrades to "no fresh count" and that's fine.
  }
}

export interface FreshCount {
  /** Items added since last visit; 0 if no fresh items or first visit. */
  delta: number;
  /** Current snapshot total. */
  total: number;
  /** True when delta > 0 — render as `+N` delta chip. */
  hasFresh: boolean;
}

/**
 * Returns the fresh-count state for a route. SSR returns `{0, current,
 * false}` so the server-rendered output matches a "no localStorage"
 * client; the real value swaps in after mount on the client.
 */
export function useFreshCount(routeKey: string, currentCount: number): FreshCount {
  const [lastSeen, setLastSeen] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLastSeen(readLastSeen(routeKey));
    setMounted(true);
    // Re-read when storage changes in another tab.
    function onStorage(e: StorageEvent) {
      if (e.key === lastSeenKey(routeKey)) {
        setLastSeen(readLastSeen(routeKey));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [routeKey]);

  const safeCurrent = Number.isFinite(currentCount) && currentCount >= 0 ? currentCount : 0;

  if (!mounted) {
    // SSR + pre-mount: pretend we know nothing. Sidebar falls back to
    // showing the cumulative total via `total`.
    return { delta: 0, total: safeCurrent, hasFresh: false };
  }

  const delta = Math.max(0, safeCurrent - lastSeen);
  return {
    delta,
    total: safeCurrent,
    // First-visit (lastSeen === 0) doesn't count as "fresh" — we'd
    // otherwise show the entire inventory as new, which is noisy. The
    // user will see the cumulative total instead, then the next visit
    // shows a real delta.
    hasFresh: lastSeen > 0 && delta > 0,
  };
}
