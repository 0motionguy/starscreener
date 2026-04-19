// StarScreener Pipeline — seed shared stores from the REAL GitHub API.
//
// Silent mock seeding is gone. Discovery now flows through
// `data/trending.json` (refreshed hourly by the scrape-trending GHA
// workflow); each resolved `owner/name` is run through the live GitHub
// adapter via `ingestBatch()`. `createGitHubAdapter({ useMock: false })`
// throws when `GITHUB_TOKEN` is missing — we let that bubble up so cold
// deploys fail loudly rather than silently producing synthetic data.

import type { PipelineStores } from "../storage/singleton";
import { createGitHubAdapter, ingestBatch } from "./ingest";
import { getAllFullNames } from "../../trending";

export interface SeedLiveOptions {
  /**
   * Optional category filter — kept for API compatibility with existing
   * cron callers. Phase 1 ignores this because trending.json is not
   * partitioned by StarScreener's internal category taxonomy; the
   * classifier handles categorization downstream of ingestion.
   */
  categories?: string[];
  /** Hard cap on how many repos to ingest this call (smoke tests). */
  limit?: number;
  /** Override the delay between GitHub requests. Defaults to 100ms. */
  delayMs?: number;
}

export interface SeedLiveResult {
  reposIngested: number;
  snapshotsAdded: number;
  failed: number;
  rateLimitRemaining: number | null;
}

/**
 * Drive a real, non-mock seed run against the curated SEED_REPOS list. Each
 * repo is fetched from GitHub, normalized, and a fresh RepoSnapshot is
 * written for the ingestion timestamp. No synthetic backfill — historical
 * points come from the stargazer backfill path.
 *
 * Throws via `createGitHubAdapter` when `GITHUB_TOKEN` is unset.
 */
export async function seedPipelineLive(
  stores: PipelineStores,
  opts: SeedLiveOptions = {},
): Promise<SeedLiveResult> {
  const fullNames = collectFullNames(opts);

  // Bailing early on an empty set avoids spinning up an adapter (and thus
  // the GITHUB_TOKEN check) when the caller filtered down to nothing.
  if (fullNames.length === 0) {
    return {
      reposIngested: 0,
      snapshotsAdded: 0,
      failed: 0,
      rateLimitRemaining: null,
    };
  }

  const adapter = createGitHubAdapter({ useMock: false });
  const batch = await ingestBatch(fullNames, {
    githubAdapter: adapter,
    repoStore: stores.repoStore,
    snapshotStore: stores.snapshotStore,
    mentionStore: stores.mentionStore,
    delayMs: opts.delayMs ?? 100,
  });

  return {
    reposIngested: batch.ok,
    // Each OK ingest appends exactly one snapshot; failed ingests append none.
    snapshotsAdded: batch.ok,
    failed: batch.failed,
    rateLimitRemaining: batch.rateLimitRemaining,
  };
}

function collectFullNames(opts: SeedLiveOptions): string[] {
  const all = getAllFullNames();
  if (opts.limit !== undefined && all.length > opts.limit) {
    return all.slice(0, opts.limit);
  }
  return all;
}
