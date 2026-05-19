"use client";

/**
 * MarkVisited — invisible client component that records a "last visit"
 * snapshot for a sidebar route. Mount this from any server-rendered
 * route page (e.g. /skills) and the sidebar's `useFreshCount` hook on
 * the next render will show fresh deltas.
 *
 * Usage:
 *   <MarkVisited routeKey="skills" count={skills.length} />
 *
 * Renders nothing — `null`. The effect runs once per mount and writes
 * `lastSeen.<routeKey>` + `lastSeen.<routeKey>.at` to localStorage.
 */
import { useEffect } from "react";
import { markVisited } from "@/lib/use-fresh-count";

export function MarkVisited({
  routeKey,
  count,
}: {
  routeKey: string;
  count: number;
}) {
  useEffect(() => {
    markVisited(routeKey, count);
  }, [routeKey, count]);
  return null;
}
