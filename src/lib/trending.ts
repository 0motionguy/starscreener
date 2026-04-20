// Trending + deltas loader.
//
// Phase 1 replaced src/lib/seed-repos.ts with data/trending.json as the
// discovery source. Phase 3 adds data/deltas.json (computed in GHA from
// git history of trending.json) as the delta source, replacing the
// Vercel-Lambda-ephemeral snapshot pipeline.
//
// Both files ship with the build, so every Lambda sees the same data
// without any cross-invocation state.

import trending from "../../data/trending.json";
import deltasData from "../../data/deltas.json";
import type { Repo } from "./types";

export type TrendingPeriod = "past_24_hours" | "past_week" | "past_month";
export type TrendingLanguage = "All" | "Python" | "TypeScript" | "Rust" | "Go";

// OSS Insight returns all numeric columns as strings. We preserve the raw
// shape here; callers that need numbers should parse at the boundary.
export interface TrendingRow {
  repo_id: string;
  repo_name: string; // "owner/name"
  primary_language: string;
  description: string;
  stars: string;
  forks: string;
  pull_requests: string;
  pushes: string;
  total_score: string;
  contributor_logins: string;
  collection_names: string;
}

interface TrendingFile {
  fetchedAt: string;
  buckets: Record<TrendingPeriod, Record<TrendingLanguage, TrendingRow[]>>;
}

const data = trending as unknown as TrendingFile;

export const lastFetchedAt: string = data.fetchedAt;

export function getTrending(
  period: TrendingPeriod,
  language: TrendingLanguage,
): TrendingRow[] {
  return data.buckets[period]?.[language] ?? [];
}

/**
 * Flatten every bucket into a deduped `owner/name[]`. Used by the ingestion
 * seed path as the replacement for the old SEED_REPOS allowlist.
 */
export function getAllFullNames(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const langMap of Object.values(data.buckets)) {
    for (const rows of Object.values(langMap)) {
      for (const row of rows) {
        const name = row.repo_name;
        // OSS Insight occasionally returns non-owner/name shapes; guard.
        if (!name || !name.includes("/")) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 3: deltas from git history of data/trending.json.
// ---------------------------------------------------------------------------

export type DeltaWindowKey = "1h" | "24h" | "7d" | "30d";

export type DeltaValue =
  | { value: number; basis: "exact" | "nearest"; from_commit: string; from_ts: number }
  | { value: null; basis: "no-history" }
  | { value: null; basis: "repo-not-tracked" };

export interface RepoDeltaEntry {
  stars_now: number;
  delta_1h: DeltaValue;
  delta_24h: DeltaValue;
  delta_7d: DeltaValue;
  delta_30d: DeltaValue;
}

export interface WindowPick {
  target_ts: number;
  buffer_s: number;
  picked_commit: string;
  picked_ts: number;
  offset_s: number;
  basis: "exact" | "nearest";
}

export interface DeltasJson {
  computedAt: string;
  windows: Record<DeltaWindowKey, WindowPick | null>;
  repos: Record<string, RepoDeltaEntry>;
}

const deltas = deltasData as unknown as DeltasJson;

export const deltasComputedAt: string = deltas.computedAt;

export function getDeltas(): DeltasJson {
  return deltas;
}

// Cache: owner/name → OSS Insight repo_id. Built once from trending buckets.
let _fullNameToRepoId: Map<string, string> | null = null;
function fullNameIndex(): Map<string, string> {
  if (_fullNameToRepoId) return _fullNameToRepoId;
  const map = new Map<string, string>();
  for (const langMap of Object.values(data.buckets)) {
    for (const rows of Object.values(langMap)) {
      for (const row of rows) {
        if (!row.repo_name || !row.repo_id) continue;
        if (!map.has(row.repo_name)) map.set(row.repo_name, row.repo_id);
      }
    }
  }
  _fullNameToRepoId = map;
  return map;
}

/** Count of repos in deltas.json that have at least one non-null delta. */
export function deltasCoveragePct(): number {
  const repos = deltas.repos ?? {};
  const total = Object.keys(repos).length;
  if (total === 0) return 0;
  let covered = 0;
  for (const entry of Object.values(repos)) {
    if (
      entry.delta_1h.value !== null ||
      entry.delta_24h.value !== null ||
      entry.delta_7d.value !== null ||
      entry.delta_30d.value !== null
    ) {
      covered += 1;
    }
  }
  return (covered * 100) / total;
}

/**
 * Project the delta values for this repo onto a fresh Repo copy. Replaces
 * the previous `applyDeltasToRepo(repo, computeAllDeltas(...))` pair which
 * relied on the ephemeral in-memory snapshot store.
 *
 * Null deltas are shimmed to 0 so the existing scoring/UI code paths —
 * which type the delta fields as plain `number` — keep working. The
 * accompanying `*Missing` flags let the classifier distinguish "we didn't
 * see movement" (value: 0) from "we don't know yet" (value: 0, missing:
 * true) during cold-start and for repos that weren't in the historical
 * snapshot.
 */
export function assembleRepoFromTrending(repo: Repo, d: DeltasJson): Repo {
  const repoId = fullNameIndex().get(repo.fullName);
  const entry = repoId ? d.repos[repoId] : undefined;

  // Prefer current delta values from the new source; fall back to existing
  // repo values only when no entry exists at all (so we don't zero-out a
  // prior snapshot pipeline's numbers in dev environments before the first
  // scrape lands).
  if (!entry) {
    return { ...repo, hasMovementData: false };
  }

  const take = (v: DeltaValue): { value: number; missing: boolean } => {
    if (v.value === null) return { value: 0, missing: true };
    return { value: v.value, missing: false };
  };

  const d1 = take(entry.delta_1h);
  const d24 = take(entry.delta_24h);
  const d7 = take(entry.delta_7d);
  const d30 = take(entry.delta_30d);

  // starsDelta24h: use the 1h window as a stand-in only if 24h is missing
  // AND 1h has a real value — otherwise honor the 24h shim so downstream
  // filters don't conflate hourly churn with 24h movement.
  const starsDelta24h = d24.missing && !d1.missing ? d1.value : d24.value;
  const starsDelta24hMissing = d24.missing && d1.missing;

  const hasMovementData = !(d1.missing && d24.missing && d7.missing && d30.missing);

  return {
    ...repo,
    starsDelta24h,
    starsDelta7d: d7.value,
    starsDelta30d: d30.value,
    // OSS Insight trending rows don't carry fork or contributor deltas —
    // those metrics stay shimmed at 0 with their *Missing flag set. Once a
    // future scrape captures them, this adapter picks them up automatically.
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    hasMovementData,
    starsDelta24hMissing,
    starsDelta7dMissing: d7.missing,
    starsDelta30dMissing: d30.missing,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
  };
}
