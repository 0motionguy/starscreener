// StarScreener Pipeline — facade
//
// ONE entry point for every consumer (UI, MCP server, CLI, HTTP API, tests).
// Anything in the pipeline worth doing is reachable via the `pipeline` object
// exported below. Keeping the surface here means other layers never reach
// directly into singleton stores or internal engines — they go through the
// facade so implementations can evolve safely.

import type { Repo } from "../types";
import { ingestRepo as ingestOne, ingestBatch as ingestMany, createGitHubAdapter } from "./ingestion/ingest";
import type {
  AlertEvent,
  AlertRule,
  IngestBatchResult,
  IngestResult,
  RepoReason,
  RepoScore,
} from "./types";
import {
  alertEventStore,
  alertRuleStore,
  categoryStore,
  flushPendingPersist,
  hydrateAlertStores,
  hydrateAll,
  mentionStore,
  persistAll,
  reasonStore,
  repoStore,
  scoreStore,
  snapshotStore,
} from "./storage/singleton";
import { isPersistenceEnabled } from "./storage/file-persistence";
import { assembleRepoFromTrending, getDeltas } from "../trending";
import { deriveSparklineData } from "./ingestion/snapshotter";
import { emitPipelineEvent } from "./events";
import {
  classifyBatch,
  classifyRepo,
  deriveTags,
} from "./classification/classifier";
import { scoreBatch, scoreRepo } from "./scoring/engine";
import { generateReasons, generateReasonsBatch } from "./reasons/generator";
import {
  buildTriggerContext,
  evaluateAllRules,
  evaluateRulesForRepo,
} from "./alerts/engine";
import type { TriggerContext } from "./alerts/triggers";
import {
  createRule,
  validateRule,
  type CreateRuleInput,
} from "./alerts/rule-management";
import { deliverAlertsViaEmail } from "../email/deliver";
import { withRecomputeLock } from "./locks";

import {
  getBreakouts,
  getCategoryMovers,
  getMostDiscussed,
  getNewRepos,
  getQuietKillers,
  getRelatedRepos,
  getReposByCategory,
  getRepoCompare,
  getRepoSummary,
  getTopMovers,
  searchReposByQuery,
} from "./queries/service";
import {
  getCategoryStats,
  getGlobalStats,
  getTopMoversByAllWindows,
} from "./queries/aggregate";
import { getFeaturedTrending } from "./queries/featured";
import {
  getFreshReleases,
  getMetaCounts,
  getRankClimbers,
} from "./queries/meta-counts";
import type { FeaturedCard, MetaCounts, MetaFilter } from "../types";

// ---------------------------------------------------------------------------
// One-shot seed / hydrate guard
// ---------------------------------------------------------------------------

let isSeeded = false;
let readyPromise: Promise<void> | null = null;

/**
 * Synchronous readiness marker. With auto-seed removed, this never performs
 * I/O — it just flips the guard so query wrappers don't spin waiting for a
 * seed that will never come from inside a query path. Delta state now ships
 * as committed JSON under `data/` (see src/lib/trending.ts); the in-memory
 * pipeline stores only hold local sparkline / snapshot residue from
 * optional dev-time ingests via `/api/pipeline/ingest`.
 *
 * Callers that depend on persisted state being loaded MUST still await
 * `ensureReady()` from an async entry point (API route, server component)
 * before the first store read.
 */
function ensureSeeded(): void {
  if (isSeeded) return;
  isSeeded = true;
  // Intentionally do NOT call seedPipeline()/recomputeAll() here. On a cold
  // empty pipeline there is nothing to recompute; on a warm pipeline the
  // async ensureReady() path has already hydrated + recomputed as needed.
}

/**
 * Canonical async bootstrap. Idempotent — concurrent callers share one
 * in-flight promise; subsequent calls after resolution return immediately.
 *
 * Order of operations:
 *  1. Hydrate every store from disk (no-op when persistence is disabled).
 *  2. If hydration produced zero repos, there is NO mock fallback — we just
 *     mark the pipeline seeded and return. Queries for delta/score data
 *     still return values because those are assembled from `data/deltas.json`
 *     at the Repo boundary (see `assembleRepoFromTrending`); only the
 *     sparkline / snapshot-derived fields degrade until a manual ingest.
 *
 * Every API route that reads pipeline data should `await pipeline.ensureReady()`
 * before the first store read. Server components should await it at the top
 * of their render function (App Router allows async server components).
 */
export async function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await hydrateAll();
      // Whether or not hydration produced data, the pipeline is now "ready":
      // consumers can read, mutators will debounce-persist. The authoritative
      // delta source is committed JSON, so zero-hydration doesn't block reads.
      isSeeded = true;
    })();
  }
  await readyPromise;
  await hydrateAlertStores();
}

/**
 * Legacy alias retained for existing call sites (cron routes, older imports).
 * Delegates to `ensureReady()`.
 */
export async function ensureSeededAsync(): Promise<void> {
  return ensureReady();
}

/** Flush every store to disk. Safe to call at any time. */
export async function persistPipeline(): Promise<void> {
  await persistAll();
}

// ---------------------------------------------------------------------------
// Recompute
// ---------------------------------------------------------------------------

export interface RecomputeSummary {
  reposRecomputed: number;
  scoresComputed: number;
  reasonsGenerated: number;
  alertsFired: number;
  durationMs: number;
}

/**
 * Recompute deltas, scores, categories, reasons, and global rank for every
 * repo currently in the store. Updates all derived stores and the Repo
 * objects themselves in one consistent pass. After persisting the fresh
 * state, evaluates every active AlertRule against the new Repo+Score
 * context using the previous Repo/Score snapshot so rank-jump, momentum
 * threshold crossings, and new-release detection work correctly.
 */
function recomputeAll(): RecomputeSummary {
  const startedAt = Date.now();

  // 0. Snapshot previous state (repos + scores) BEFORE we mutate anything.
  //    These are fed into the alert engine as `previousRepo`/`previousScore`.
  //    Use `getActive()` so soft-deleted repos (marked via /api/pipeline/cleanup)
  //    are excluded from scoring + alert evaluation — otherwise tombstones keep
  //    firing rules and email deliveries reference repos that no longer exist
  //    (F-DATA-001, Phase 2 P-110).
  const baseRepos = repoStore.getActive();
  const previousRepos = new Map<string, Repo>();
  for (const r of baseRepos) {
    previousRepos.set(r.id, r);
  }
  const previousScores = new Map<string, RepoScore>();
  for (const s of scoreStore.getAll()) {
    previousScores.set(s.repoId, s);
  }

  // 1. Pull current repos, project deltas from data/deltas.json (git-history
  //    source), derive the 30-day sparkline from the snapshot history that
  //    still exists in dev, and stitch both back onto each Repo.
  //    Deltas are loaded once outside the map — the JSON is static.
  const trendingDeltas = getDeltas();
  const freshRepos: Repo[] = baseRepos.map((repo) => {
    const sparklineData = deriveSparklineData(repo.id, snapshotStore);
    return { ...assembleRepoFromTrending(repo, trendingDeltas), sparklineData };
  });

  // 2. Score everything in one pass so category averages are consistent.
  const scores = scoreBatch(freshRepos);
  for (const score of scores) {
    scoreStore.save(score);
  }

  // 3. Classify everything, then project the primary categoryId onto each
  //    fresh Repo so ranking, filters, and category stats see real topic-
  //    derived categories instead of the normalizer's "other" placeholder.
  const classifications = classifyBatch(freshRepos);
  for (let i = 0; i < classifications.length; i++) {
    const classification = classifications[i];
    categoryStore.save(classification);
    // Derive flat, multi-label AI-focus tags in the same pass so cards +
    // filter bar + /api/repos?tag= all see consistent data.
    const tags = deriveTags(freshRepos[i]);
    freshRepos[i] = {
      ...freshRepos[i],
      categoryId: classification.primary.categoryId,
      tags,
    };
  }

  // 4. Generate reasons in batch. Feed in previous rank so rank_jump works.
  const reasonInputs = freshRepos.map((repo, i) => {
    const prev = baseRepos[i];
    const score = scores[i];
    return {
      repo,
      previousRank: prev?.rank,
      socialAggregate: mentionStore.aggregateForRepo(repo.id),
      isBreakout: score.isBreakout,
      isQuietKiller: score.isQuietKiller,
    };
  });
  const reasons = generateReasonsBatch(reasonInputs);
  for (const r of reasons) {
    reasonStore.save(r);
  }

  // 5. Recompute global rank — highest overall score = rank 1.
  const ranked = freshRepos
    .map((repo, i) => ({ repo, score: scores[i] }))
    .sort((a, b) => b.score.overall - a.score.overall);

  // Track per-category position for categoryRank.
  const perCategoryCounter = new Map<string, number>();

  const rankedRepos: Repo[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const { repo, score } = ranked[i];
    const catIndex = perCategoryCounter.get(repo.categoryId) ?? 0;
    perCategoryCounter.set(repo.categoryId, catIndex + 1);

    const updated: Repo = {
      ...repo,
      momentumScore: score.overall,
      movementStatus: score.movementStatus,
      rank: i + 1,
      categoryRank: catIndex + 1,
    };
    repoStore.upsert(updated);
    rankedRepos.push(updated);

    // Emit rank change event when the repo's global rank moved.
    const prev = previousRepos.get(repo.id);
    const prevRank = prev?.rank ?? null;
    const newRank = i + 1;
    if (prevRank !== newRank) {
      emitPipelineEvent({
        type: "rank_changed",
        at: new Date().toISOString(),
        repoId: repo.id,
        fullName: repo.fullName,
        fromRank: prevRank && prevRank > 0 ? prevRank : null,
        toRank: newRank,
        window: "overall",
      });
    }

    // Emit breakout event on new-breakout transitions.
    const prevScore = previousScores.get(repo.id);
    if (score.isBreakout && !prevScore?.isBreakout) {
      emitPipelineEvent({
        type: "breakout_detected",
        at: new Date().toISOString(),
        repoId: repo.id,
        fullName: repo.fullName,
        score: score.overall,
      });
    }
  }

  // 6. Evaluate alerts against the fresh state, using previous state
  //    for delta-sensitive triggers (rank_jump, momentum_threshold,
  //    new_release, breakout transitions).
  const ctxMap = new Map<string, TriggerContext>();
  for (const repo of rankedRepos) {
    const score = scoreStore.get(repo.id);
    const prevRepo = previousRepos.get(repo.id);
    const prevScore = previousScores.get(repo.id);
    ctxMap.set(
      repo.id,
      buildTriggerContext(repo, score, prevRepo, prevScore, prevRepo?.rank),
    );
  }
  const firedEvents = evaluateAllRules(ctxMap, alertRuleStore, alertEventStore);

  for (const ev of firedEvents) {
    const repo = repoStore.get(ev.repoId);
    if (!repo) continue;
    emitPipelineEvent({
      type: "alert_triggered",
      at: ev.firedAt,
      ruleId: ev.ruleId,
      repoId: ev.repoId,
      fullName: repo.fullName,
      condition: ev.trigger,
    });
  }

  // P0.1: fire-and-forget email delivery. No-op when
  // RESEND_API_KEY / ALERT_EMAIL_TO are unset (dev, pre-DNS-propagation).
  // Errors are logged by the delivery layer — we don't propagate them
  // so a Resend outage can't wedge the recompute loop.
  //
  // Phase 2 (F-OBSV-002): log the DeliveryStats on both success and failure
  // so operators can see at a glance whether emails actually went out,
  // without awaiting the call (preserves "don't wedge recompute" spirit).
  if (firedEvents.length > 0) {
    const repoLookup = new Map(rankedRepos.map((r) => [r.id, r]));
    deliverAlertsViaEmail(firedEvents, repoLookup)
      .then((stats) => {
        console.log(
          JSON.stringify({
            scope: "alert:delivery",
            level: stats.failed > 0 ? "warn" : "info",
            ...stats,
          }),
        );
      })
      .catch((err) => {
        console.error(
          JSON.stringify({
            scope: "alert:delivery",
            level: "error",
            message: err instanceof Error ? err.message : String(err),
            eventsConsidered: firedEvents.length,
          }),
        );
      });
  }

  return {
    reposRecomputed: freshRepos.length,
    scoresComputed: scores.length,
    reasonsGenerated: reasons.length,
    alertsFired: firedEvents.length,
    durationMs: Date.now() - startedAt,
  };
}

/** Single-repo recompute. No-op when the repoId is unknown. */
function recomputeRepo(repoId: string): RecomputeSummary {
  const startedAt = Date.now();
  const repo = repoStore.get(repoId);
  if (!repo) {
    return {
      reposRecomputed: 0,
      scoresComputed: 0,
      reasonsGenerated: 0,
      alertsFired: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Snapshot previous state for this repo so alert triggers that compare
  // to the prior tick (rank_jump, momentum_threshold, new_release, breakout)
  // still work correctly on a single-repo pass.
  const previousRepo = repo;
  const previousScore = scoreStore.get(repoId);

  const sparklineData = deriveSparklineData(repoId, snapshotStore);
  const fresh: Repo = { ...assembleRepoFromTrending(repo, getDeltas()), sparklineData };

  const score = scoreRepo(fresh);
  scoreStore.save(score);

  const classification = classifyRepo(fresh);
  categoryStore.save(classification);
  // Project the classification's primary categoryId onto the repo so the
  // single-repo recompute matches the batch path's semantics.
  fresh.categoryId = classification.primary.categoryId;
  fresh.tags = deriveTags(fresh);

  const reason: RepoReason = generateReasons({
    repo: fresh,
    previousRank: repo.rank,
    socialAggregate: mentionStore.aggregateForRepo(repoId),
    isBreakout: score.isBreakout,
    isQuietKiller: score.isQuietKiller,
  });
  reasonStore.save(reason);

  const updatedRepo: Repo = {
    ...fresh,
    momentumScore: score.overall,
    movementStatus: score.movementStatus,
  };
  repoStore.upsert(updatedRepo);

  // Evaluate alerts for just this repo.
  const ctx = buildTriggerContext(
    updatedRepo,
    score,
    previousRepo,
    previousScore,
    previousRepo.rank,
  );
  const fired = evaluateRulesForRepo(
    updatedRepo.id,
    ctx,
    alertRuleStore,
    alertEventStore,
  );

  return {
    reposRecomputed: 1,
    scoresComputed: 1,
    reasonsGenerated: 1,
    alertsFired: fired.length,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Ingestion (facade wrappers over the ingest module)
// ---------------------------------------------------------------------------

export interface IngestFacadeOptions {
  /** Override the default GitHub adapter (e.g., mock vs real). */
  githubAdapter?: ReturnType<typeof createGitHubAdapter>;
}

async function ingestRepoFacade(
  fullName: string,
  opts: IngestFacadeOptions = {},
): Promise<IngestResult> {
  return ingestOne(fullName, {
    githubAdapter: opts.githubAdapter ?? createGitHubAdapter(),
    repoStore,
    snapshotStore,
    mentionStore,
  });
}

async function ingestBatchFacade(
  fullNames: string[],
  opts: IngestFacadeOptions = {},
): Promise<IngestBatchResult> {
  return ingestMany(fullNames, {
    githubAdapter: opts.githubAdapter ?? createGitHubAdapter(),
    repoStore,
    snapshotStore,
    mentionStore,
  });
}

// ---------------------------------------------------------------------------
// Query wrappers — guarantee seeding before every read
// ---------------------------------------------------------------------------

function withSeed<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: T): R => {
    ensureSeeded();
    return fn(...args);
  };
}

// ---------------------------------------------------------------------------
// Facade export
// ---------------------------------------------------------------------------

/**
 * The single public interface to the pipeline. All consumers — UI, API
 * routes, MCP server, CLI, tests — should reach into the pipeline through
 * this object, never into individual stores or engines directly.
 */
export const pipeline = {
  // Ingestion
  ingestRepo: ingestRepoFacade,
  ingestBatch: ingestBatchFacade,

  // Compute
  //
  // Recompute is a read-modify-write across every store and alert state;
  // concurrent invocations (two cron jobs, a cron + a manual recompute,
  // etc.) produced lost-update races and duplicate alerts. The
  // withRecomputeLock helper coalesces every concurrent caller onto a
  // single in-flight run so at most one recompute executes at a time
  // (P-112, F-RACE-001).
  recomputeAll: (): Promise<RecomputeSummary> =>
    withRecomputeLock(async () => {
      // Hydrate first so a recompute triggered by an API call doesn't
      // overwrite persisted state with an empty recompute. If the async
      // bootstrap hasn't run yet, fall through to the sync seed path.
      if (!readyPromise && !isSeeded) {
        await ensureReady();
      } else if (!isSeeded) {
        // readyPromise may still be pending — await it.
        await readyPromise;
      }
      const summary = recomputeAll();
      // Flush fresh state to disk so a server restart resumes in place.
      await persistPipeline();
      return summary;
    }),
  recomputeRepo: (repoId: string) => {
    ensureSeeded();
    return recomputeRepo(repoId);
  },
  /** Flush every store to disk. */
  persist: async (): Promise<void> => {
    await persistAll();
  },

  // Queries (all go through ensureSeeded before executing)
  getTopMovers: withSeed(getTopMovers),
  getCategoryMovers: withSeed(getCategoryMovers),
  getBreakouts: withSeed(getBreakouts),
  getQuietKillers: withSeed(getQuietKillers),
  getMostDiscussed: withSeed(getMostDiscussed),
  getNewRepos: withSeed(getNewRepos),
  getRepoSummary: withSeed(getRepoSummary),
  getRepoCompare: withSeed(getRepoCompare),
  getRelatedRepos: withSeed(getRelatedRepos),
  getCategoryStats: withSeed(getCategoryStats),
  getGlobalStats: withSeed(getGlobalStats),
  getTopMoversByAllWindows: withSeed(getTopMoversByAllWindows),
  searchReposByQuery: withSeed(searchReposByQuery),

  // Terminal-layer queries
  getReposByCategory: withSeed((id: string) => getReposByCategory(id)),
  getFeaturedTrending: withSeed(
    (opts?: {
      limit?: number;
      watchlistRepoIds?: string[];
      metaFilter?: MetaFilter | null;
    }): FeaturedCard[] => getFeaturedTrending(opts),
  ),
  getMetaCounts: withSeed((): MetaCounts => getMetaCounts()),
  getRankClimbers: withSeed((limit?: number) => getRankClimbers(limit)),
  getFreshReleases: withSeed((hoursBack: number, limit: number) =>
    getFreshReleases(hoursBack, limit),
  ),

  // Alerts — evaluates every active rule (optionally scoped to userId) against
  // the current Repo/Score state and returns the fresh AlertEvents that fired.
  evaluateAlerts: (userId?: string): AlertEvent[] => {
    ensureSeeded();
    const ctxByRepoId = new Map<string, TriggerContext>();
    for (const repo of repoStore.getAll()) {
      const score = scoreStore.get(repo.id);
      ctxByRepoId.set(repo.id, buildTriggerContext(repo, score));
    }
    const fired = evaluateAllRules(ctxByRepoId, alertRuleStore, alertEventStore);
    if (userId === undefined) return fired;
    return fired.filter((e) => e.userId === userId);
  },

  /**
   * Standalone alert evaluator — same contract as evaluateAlerts but guaranteed
   * not to re-score anything. Used by the /api/pipeline/alerts endpoint when
   * callers want to force a fresh evaluation against current state.
   */
  evaluateAlertsNow: (userId?: string): AlertEvent[] => {
    ensureSeeded();
    const ctxByRepoId = new Map<string, TriggerContext>();
    for (const repo of repoStore.getAll()) {
      const score = scoreStore.get(repo.id);
      ctxByRepoId.set(repo.id, buildTriggerContext(repo, score));
    }
    const fired = evaluateAllRules(ctxByRepoId, alertRuleStore, alertEventStore);
    if (userId === undefined) return fired;
    return fired.filter((e) => e.userId === userId);
  },

  /**
   * Read stored AlertEvents. When `userId` is supplied, scopes to that user;
   * otherwise returns events across all users (useful for admin dashboards).
   */
  getAlerts: (userId?: string): AlertEvent[] => {
    ensureSeeded();
    if (userId !== undefined) {
      return alertEventStore.listForUser(userId);
    }
    // No getAll() on the store interface — aggregate across known users by
    // collecting per-rule userIds. AlertRules hold the canonical set of
    // userIds the system knows about.
    const seen = new Set<string>();
    for (const rule of alertRuleStore.listAll()) {
      seen.add(rule.userId);
    }
    // Always include "local" for the default single-user MVP path.
    seen.add("local");
    const out: AlertEvent[] = [];
    for (const u of seen) {
      out.push(...alertEventStore.listForUser(u));
    }
    // Sort newest-first so callers don't need to.
    out.sort((a, b) => (a.firedAt < b.firedAt ? 1 : a.firedAt > b.firedAt ? -1 : 0));
    return out;
  },

  /**
   * Mark an alert event as read. Returns true when the event existed and was
   * updated (or was already read), false when no such event exists.
   */
  markAlertRead: (eventId: string): boolean => {
    ensureSeeded();
    // The store's markRead is a void no-op when the event is missing — probe
    // existence first via listForUser across known users so we can return an
    // accurate boolean to the caller.
    const userIds = new Set<string>();
    for (const rule of alertRuleStore.listAll()) userIds.add(rule.userId);
    userIds.add("local");
    for (const u of userIds) {
      if (alertEventStore.listForUser(u).some((e) => e.id === eventId)) {
        alertEventStore.markRead(eventId);
        return true;
      }
    }
    return false;
  },

  /** List alert rules for a user. Defaults to all rules when userId omitted. */
  listAlertRules: (userId?: string): AlertRule[] => {
    ensureSeeded();
    if (userId === undefined) return alertRuleStore.listAll();
    return alertRuleStore.listForUser(userId);
  },

  /**
   * Create and persist a new AlertRule. Throws when the input fails
   * `validateRule` so API callers can surface the errors as 400s.
   */
  createAlertRule: (input: CreateRuleInput): AlertRule => {
    ensureSeeded();
    const rule = createRule(input);
    const validation = validateRule(rule);
    if (!validation.valid) {
      throw new Error(
        `createAlertRule: invalid rule — ${validation.errors.join("; ")}`,
      );
    }
    return alertRuleStore.save(rule);
  },

  /** Delete an alert rule by id. Returns whether anything was deleted. */
  deleteAlertRule: (ruleId: string): boolean => {
    ensureSeeded();
    return alertRuleStore.remove(ruleId);
  },

  // Seed / admin
  ensureSeeded: (): void => {
    ensureSeeded();
  },
  /**
   * Async bootstrap — hydrate from disk, falling back to the mock seed when
   * no persisted data exists. Await at the top of any API route or server
   * component that reads pipeline data so the first render after a cold
   * start sees the same state the previous process left behind.
   */
  ensureReady,
  /**
   * Flush any pending debounced persist immediately. Useful in shutdown
   * handlers or after a burst of mutations you want durable before replying.
   */
  flushPersist: async (): Promise<void> => {
    if (!isPersistenceEnabled()) return;
    await flushPendingPersist();
  },
};

// Expose the seed-guard reset hook for tests that want a fully cold start.
export function __resetPipelineSeedGuardForTests(): void {
  isSeeded = false;
  readyPromise = null;
}

// Re-export the stores bundle under one namespace so integration tests can
// reach in if they need to inspect raw state. UI code should stay on the
// facade above.
export {
  alertEventStore,
  alertRuleStore,
  categoryStore,
  mentionStore,
  reasonStore,
  repoStore,
  scoreStore,
  snapshotStore,
};
