// Trending loader — reads data/trending.json (committed hourly by GHA).
// This is the Phase-1 replacement for src/lib/seed-repos.ts as the discovery
// source. The data file is refreshed by scripts/scrape-trending.mjs and the
// scrape-trending GHA workflow; downstream ingestion still uses the existing
// GitHub adapter, so snapshots/classifier behavior is unchanged.

import trending from "../../data/trending.json";

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
