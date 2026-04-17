// StarScreener Pipeline — seed shared stores from the REAL GitHub API.
//
// Silent mock seeding is gone. This module reads the curated SEED_REPOS list
// in `src/lib/seed-repos.ts` and runs every `owner/name` through the live
// GitHub adapter via `ingestBatch()`. `createGitHubAdapter({ useMock: false })`
// throws when `GITHUB_TOKEN` is missing — we let that bubble up so cold
// deploys fail loudly rather than silently producing synthetic data.

import type { PipelineStores } from "../storage/singleton";
import { createGitHubAdapter, ingestBatch } from "./ingest";
import { SEED_REPOS, type SeedCategoryId } from "../../seed-repos";

export interface SeedLiveOptions {
  /** Restrict to a subset of SEED_REPOS keys (chunked cron runs). */
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

/**
 * Flatten SEED_REPOS into a deduped `owner/name[]` honoring `categories` and
 * `limit`. Unknown category keys are ignored (same behavior as filtering an
 * empty subset — they just contribute nothing).
 */
function collectFullNames(opts: SeedLiveOptions): string[] {
  const keys = Object.keys(SEED_REPOS) as SeedCategoryId[];
  const filter = opts.categories && opts.categories.length > 0
    ? new Set(opts.categories.map((c) => c.trim()).filter((c) => c.length > 0))
    : null;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    if (filter && !filter.has(key)) continue;
    for (const fullName of SEED_REPOS[key]) {
      if (seen.has(fullName)) continue;
      seen.add(fullName);
      out.push(fullName);
      if (opts.limit !== undefined && out.length >= opts.limit) {
        return out;
      }
    }
  }
  return out;
}
