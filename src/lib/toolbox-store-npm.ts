// TOOLBOX read adapter — npm.dependents
//
// Phase A.2 PR-B. trendingrepo's npm-dependents loader keeps a
// { [package]: { count, fetchedAt } } map; TOOLBOX events for
// `trending.npm.dependents` carry the same three primitives per event
// (package, dependents_count, fetched_at). This adapter rebuilds the
// map shape from TOOLBOX events.
//
// FIELD COVERAGE: per the diagnosis query, 200 packages have a `package`
// key but only 175 have a `dependents_count` (npm has no clean public
// API — scraper sometimes writes null). The legacy contract explicitly
// allows null counts → callers MUST treat null as "unknown" rather than
// zero. This adapter preserves that contract.
//
// The flag-gating + alert-on-fallthrough wiring lives in npm-dependents.ts.

import "server-only";

import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import { fetchLeaderboardEvents } from "./toolbox-store-common";

export interface DependentsEntry {
  count: number | null;
  fetchedAt: string;
}

export type DependentsMap = Record<string, DependentsEntry>;

function entryFromEvent(event: ToolboxEvent): [string, DependentsEntry] | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const pkg = (f as { package?: unknown }).package;
  if (typeof pkg !== "string" || !pkg) return null;
  const countRaw = (f as { dependents_count?: unknown }).dependents_count;
  const count =
    countRaw === null || countRaw === undefined
      ? null
      : typeof countRaw === "number" && Number.isFinite(countRaw)
        ? Math.max(0, Math.round(countRaw))
        : null;
  const fetchedAt =
    typeof (f as { fetched_at?: unknown }).fetched_at === "string"
      ? ((f as { fetched_at: string }).fetched_at)
      : event.produced_at ?? "";
  return [pkg, { count, fetchedAt }];
}

export async function fetchNpmDependentsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<DependentsMap | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.npm.dependents");
  if (!body) return null;

  const out: DependentsMap = {};
  for (const ev of body.targets) {
    const entry = entryFromEvent(ev);
    if (!entry) continue;
    const [name, rec] = entry;
    // Keep the most recent record per package (leaderboard returns most
    // recent first; first-write-wins via the `in` guard).
    if (!(name in out)) out[name] = rec;
  }
  return out;
}
