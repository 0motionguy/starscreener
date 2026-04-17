// StarScreener — Ingestion orchestrator.
//
// Ties the GitHub adapter, normalizer, snapshot store, and optional social
// adapters into a single `ingestRepo` entrypoint plus a batch helper. The
// orchestrator is the only place that knows about rate limiting, sequencing
// and snapshot emission — adapters stay dumb/swappable, stores stay pure.

import { GitHubApiAdapter } from "../adapters/github-adapter";
import { MockGitHubAdapter } from "../adapters/mock-github-adapter";
import { emitPipelineEvent } from "../events";
import { normalizeGitHubRepo } from "../adapters/normalizer";
import type {
  GitHubAdapter,
  IngestBatchResult,
  IngestResult,
  MentionStore,
  RepoSnapshot,
  RepoStore,
  SnapshotStore,
  SocialAdapter,
} from "../types";
import type { Repo } from "@/lib/types";

export interface IngestRepoOptions {
  githubAdapter: GitHubAdapter;
  repoStore: RepoStore;
  snapshotStore: SnapshotStore;
  socialAdapters?: SocialAdapter[];
  mentionStore?: MentionStore;
}

export interface IngestBatchOptions extends IngestRepoOptions {
  /** Delay between repos to be kind to the GitHub rate limit. */
  delayMs?: number;
}

/**
 * Ingest a single repo: fetch → normalize → persist → snapshot → social.
 * Never throws. All failures are captured in the returned IngestResult.
 */
export async function ingestRepo(
  fullName: string,
  opts: IngestRepoOptions,
): Promise<IngestResult> {
  const { githubAdapter, repoStore, snapshotStore, socialAdapters, mentionStore } =
    opts;
  const source: IngestResult["source"] =
    githubAdapter.id === "github" ? "github" : "mock";
  const fetchedAt = new Date().toISOString();

  let rateLimitRemaining: number | null = null;
  let rateLimitReset: string | null = null;

  try {
    const [rawRepo, release, contributorCount] = await Promise.all([
      githubAdapter.fetchRepo(fullName),
      githubAdapter.fetchLatestRelease(fullName),
      githubAdapter.fetchContributorCount(fullName),
    ]);

    if (!rawRepo) {
      const rl = await safeRateLimit(githubAdapter);
      rateLimitRemaining = rl?.remaining ?? null;
      rateLimitReset = rl?.reset ?? null;
      return {
        repoId: slugIdFromFullName(fullName),
        ok: false,
        source,
        fetchedAt,
        rateLimitRemaining,
        rateLimitReset,
        error: "repo not found",
        repo: null,
        latestRelease: null,
      };
    }

    const normalized: Repo = normalizeGitHubRepo(
      rawRepo,
      release,
      contributorCount,
    );

    // Preserve fields owned by downstream pipeline stages. If the store has a
    // prior record, merge-in the fields the ingest path doesn't own so we
    // don't clobber categoryId/momentum/deltas/etc.
    const existing = repoStore.get(normalized.id);
    const merged: Repo = mergePreserving(existing, normalized);
    repoStore.upsert(merged);

    // Snapshot the point-in-time metrics for the delta engine.
    const snapshot: RepoSnapshot = buildSnapshot(merged, source, fetchedAt);
    snapshotStore.append(snapshot);
    emitPipelineEvent({
      type: "snapshot_captured",
      at: snapshot.capturedAt,
      repoId: merged.id,
      fullName: merged.fullName,
      stars: snapshot.stars,
      starsDelta24h: merged.starsDelta24h ?? null,
    });

    // Optional social fan-out.
    if (socialAdapters && socialAdapters.length > 0 && mentionStore) {
      await Promise.all(
        socialAdapters.map(async (adapter) => {
          try {
            const mentions = await adapter.fetchMentionsForRepo(fullName);
            for (const m of mentions) {
              mentionStore.append(m);
            }
          } catch (err) {
            console.error(
              `[ingest] social adapter ${adapter.id} failed for ${fullName}`,
              err,
            );
          }
        }),
      );
    }

    const rl = await safeRateLimit(githubAdapter);
    rateLimitRemaining = rl?.remaining ?? null;
    rateLimitReset = rl?.reset ?? null;

    return {
      repoId: merged.id,
      ok: true,
      source,
      fetchedAt,
      rateLimitRemaining,
      rateLimitReset,
      error: null,
      repo: merged,
      latestRelease: release,
    };
  } catch (err) {
    console.error(`[ingest] unexpected error for ${fullName}`, err);
    return {
      repoId: slugIdFromFullName(fullName),
      ok: false,
      source,
      fetchedAt,
      rateLimitRemaining,
      rateLimitReset,
      error: err instanceof Error ? err.message : String(err),
      repo: null,
      latestRelease: null,
    };
  }
}

/**
 * Ingest a batch of repos sequentially with a small delay between each. Stops
 * early if the GitHub rate limit hits zero. Returns the aggregate outcome.
 */
// Module-level mutex. The app runs as a single long-lived Node.js process
// (Railway / Fly / Render — Vercel serverless doesn't hold state anyway),
// and two concurrent batches race on the GitHub rate limit and produce
// non-deterministic snapshot ordering. Serializing batches keeps both
// concerns clean without distributed-lock complexity.
let batchInFlight: Promise<IngestBatchResult> | null = null;

export async function ingestBatch(
  fullNames: string[],
  opts: IngestBatchOptions,
): Promise<IngestBatchResult> {
  if (batchInFlight) {
    // Wait for the in-flight batch to finish, then run ours. This keeps
    // simultaneous /api/cron/ingest and /api/pipeline/ingest calls deterministic.
    await batchInFlight.catch(() => {});
  }
  const run = runIngestBatch(fullNames, opts);
  batchInFlight = run;
  try {
    return await run;
  } finally {
    if (batchInFlight === run) batchInFlight = null;
  }
}

async function runIngestBatch(
  fullNames: string[],
  opts: IngestBatchOptions,
): Promise<IngestBatchResult> {
  const startedAt = new Date().toISOString();
  const delayMs = opts.delayMs ?? 200;

  const results: IngestResult[] = [];
  let ok = 0;
  let failed = 0;
  let rateLimitRemaining: number | null = null;

  for (let i = 0; i < fullNames.length; i++) {
    const fullName = fullNames[i];
    const result = await ingestRepo(fullName, opts);
    results.push(result);
    if (result.ok) ok += 1;
    else failed += 1;

    rateLimitRemaining = result.rateLimitRemaining;

    // Bail out if the adapter says it's out of requests.
    if (
      rateLimitRemaining !== null &&
      rateLimitRemaining <= 0 &&
      i < fullNames.length - 1
    ) {
      console.warn(
        `[ingest] rate limit exhausted after ${i + 1}/${fullNames.length}; stopping batch early`,
      );
      break;
    }

    if (i < fullNames.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    total: fullNames.length,
    ok,
    failed,
    rateLimitRemaining,
    results,
  };
}

/**
 * Factory returning the right GitHub adapter. Production default is the live
 * GitHubApiAdapter — a missing token is a hard error, not a silent mock. The
 * mock path is only reachable when STARSCREENER_ALLOW_MOCK=true (local dev).
 */
export function createGitHubAdapter(
  opts: { useMock?: boolean; token?: string } = {},
): GitHubAdapter {
  const token = opts.token ?? process.env.GITHUB_TOKEN ?? undefined;
  const allowMock = process.env.STARSCREENER_ALLOW_MOCK === "true";
  const useMock = opts.useMock ?? false;
  if (useMock) {
    if (!allowMock) {
      throw new Error(
        "createGitHubAdapter: useMock=true but STARSCREENER_ALLOW_MOCK is not set. " +
          "Mock adapter is disabled in production. Set STARSCREENER_ALLOW_MOCK=true for local dev.",
      );
    }
    return new MockGitHubAdapter();
  }
  if (!token) {
    throw new Error(
      "createGitHubAdapter: GITHUB_TOKEN is required. Set it in your environment " +
        "(GitHub PAT with public_repo scope). Silent mock fallback is disabled.",
    );
  }
  return new GitHubApiAdapter({ token });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeRateLimit(
  adapter: GitHubAdapter,
): Promise<{ remaining: number; reset: string } | null> {
  try {
    return await adapter.getRateLimit();
  } catch (err) {
    console.error(`[ingest] getRateLimit failed`, err);
    return null;
  }
}

/**
 * Build a RepoSnapshot from the current Repo state. The delta engine reads
 * these chronologically to compute starsDelta24h, etc.
 */
function buildSnapshot(
  repo: Repo,
  source: "github" | "mock",
  capturedAt: string,
): RepoSnapshot {
  return {
    id: `${repo.id}:${capturedAt}:${source}`,
    repoId: repo.id,
    capturedAt,
    source,
    stars: repo.stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    watchers: repo.stars,
    contributors: repo.contributors,
    sizeKb: 0, // populated from rawRepo in a later pass if we extend the snapshot
    lastCommitAt: repo.lastCommitAt ?? null,
    lastReleaseAt: repo.lastReleaseAt,
    lastReleaseTag: repo.lastReleaseTag,
    mentionCount24h: repo.mentionCount24h,
    socialBuzzScore: repo.socialBuzzScore,
  };
}

/**
 * Merge a freshly-ingested repo with the previously stored version so we keep
 * fields that downstream stages own (deltas, momentum, rank, social, etc.).
 * If there's no prior record we just return the fresh one.
 */
function mergePreserving(existing: Repo | undefined, fresh: Repo): Repo {
  if (!existing) return fresh;
  return {
    ...fresh,
    categoryId: existing.categoryId !== "other" ? existing.categoryId : fresh.categoryId,
    starsDelta24h: existing.starsDelta24h,
    starsDelta7d: existing.starsDelta7d,
    starsDelta30d: existing.starsDelta30d,
    forksDelta7d: existing.forksDelta7d,
    contributorsDelta30d: existing.contributorsDelta30d,
    momentumScore: existing.momentumScore,
    movementStatus: existing.movementStatus,
    rank: existing.rank,
    categoryRank: existing.categoryRank,
    sparklineData: existing.sparklineData,
    socialBuzzScore: existing.socialBuzzScore,
    mentionCount24h: existing.mentionCount24h,
    // Tags are owned downstream by deriveTags(); preserve across fresh upserts.
    tags: existing.tags ?? fresh.tags ?? [],
    archived: existing.archived,
    deleted: existing.deleted,
  };
}

/**
 * Local mirror of slugToId used for error paths where we don't have a
 * normalized Repo to read the id from. Must stay in sync with @/lib/utils.
 */
function slugIdFromFullName(fullName: string): string {
  return fullName
    .replace(/\//g, "--")
    .replace(/\./g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "")
    .toLowerCase();
}
