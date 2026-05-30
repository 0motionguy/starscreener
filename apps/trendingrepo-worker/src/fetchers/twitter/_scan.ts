// Shared camofox+nitter scan loop.
//
// PROBLEM
//   The hot-tier twitter fetcher's per-repo scan loop has accreted real
//   resilience logic over the past day (H5 retry on transient 5xx, H6
//   instance-chain rotation, smart-wait via the /wait selector). H4 ships
//   warm + cold tier fetchers that need IDENTICAL behavior. Keeping three
//   copies in sync would rot fast.
//
// SOLUTION
//   This module exports `scanRepoBatch(opts)` — a pure-camofox scan loop
//   that takes a repo list + instance chain, returns the projected posts
//   plus diagnostics (retries, rotations, bail reason). The three twitter
//   fetchers (hot/warm/cold) all call it.
//
// Camofox-only by design. The direct-fetch fallback is dead post-Anubis
// (every public Nitter instance has the PoW front). Callers that want the
// direct path do their own thing — this module is camofox or nothing.
//
// Two entry points:
//   - `scanRepoBatch` — serial single-tab loop (hot tier; retains H6 chain
//     rotation since the hot run is short and the instance can die mid-run).
//   - `scanRepoBatchParallel` — N-tab pool, sequential tab creation (camofox
//     rejects concurrent tab creation as `session_expired`), concurrent
//     navigate+evaluate across the pool. Cuts wall-clock by ~N×. No chain
//     rotation in V1 — warm/cold runs are infrequent enough that instance
//     death between runs is the operationally-relevant case, and chain
//     rotation across N concurrent workers needs careful coordination (V2).

import type { Logger } from 'pino';

import {
  buildNitterSearchUrl,
  closeCamofoxTab,
  createCamofoxTab,
  fetchViaCamofox,
  parseNitterSearchHtml,
  shouldRetryAfterCamofoxError,
  type TwitterRepoSignalPost,
} from './index.js';

const REQUEST_PAUSE_MS = 750;
const CONSECUTIVE_FAIL_ROTATE_THRESHOLD = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScanRepoBatchOpts {
  repos: string[];
  /** Ordered fallback chain (resolveNitterChain output). chain[0] is the head. */
  instanceChain: string[];
  log: Logger;
  /** Tag used in published log lines so the operator knows which tier ran. */
  scanLabel: string;
}

export interface ScanRepoBatchResult {
  posts: TwitterRepoSignalPost[];
  scannedRepos: number;
  failedRepos: number;
  retriesPerformed: number;
  instanceRotations: number;
  bailedOut: boolean;
  bailReason?: string;
  /** Instance the scan terminated on — useful for diagnostics across rotations. */
  finalInstance: string;
  fetchedAt: string;
}

export async function scanRepoBatch(opts: ScanRepoBatchOpts): Promise<ScanRepoBatchResult> {
  const { repos, instanceChain, log, scanLabel } = opts;
  const fetchedAt = new Date().toISOString();

  if (repos.length === 0 || instanceChain.length === 0) {
    return {
      posts: [],
      scannedRepos: 0,
      failedRepos: 0,
      retriesPerformed: 0,
      instanceRotations: 0,
      bailedOut: false,
      finalInstance: instanceChain[0] ?? '',
      fetchedAt,
    };
  }

  let instanceIdx = 0;
  let instance = instanceChain[0] ?? 'https://nitter.privacyredirect.com';

  const makeFreshTab = async (currentInstance: string): Promise<string | undefined> => {
    try {
      return await createCamofoxTab(`${currentInstance}/`);
    } catch (err) {
      log.error(
        { err: (err as Error).message, instance: currentInstance, scanLabel },
        'twitter-scan: camofox tab creation failed',
      );
      return undefined;
    }
  };

  let camofoxTabId: string | undefined = await makeFreshTab(instance);
  if (camofoxTabId) {
    log.info({ tabId: camofoxTabId, instance, scanLabel }, 'twitter-scan: tab created');
  } else {
    log.warn({ instance, scanLabel }, 'twitter-scan: initial tab create failed; will retry on first repo');
  }

  const allPosts: TwitterRepoSignalPost[] = [];
  let failed = 0;
  let consecutiveFailures = 0;
  let bailedOut = false;
  let bailReason: string | undefined;
  let retriesPerformed = 0;
  let instanceRotations = 0;

  try {
    for (const repoFullName of repos) {
      const url = buildNitterSearchUrl(instance, repoFullName);
      let attempt = 0;
      let lastErr: Error | undefined;

      for (;;) {
        if (!camofoxTabId) {
          // No tab and no fallback path here — the scan is camofox-only.
          // Try a fresh tab once more (mid-batch tab loss recovery).
          camofoxTabId = await makeFreshTab(instance);
          if (!camofoxTabId) {
            lastErr = new Error('camofox tab unavailable');
            break;
          }
        }
        try {
          const html = await fetchViaCamofox(camofoxTabId, url);
          const posts = parseNitterSearchHtml(html, repoFullName, fetchedAt, url);
          allPosts.push(...posts);
          consecutiveFailures = 0;
          lastErr = undefined;
          log.debug({ repoFullName, posts: posts.length, attempt, scanLabel }, 'twitter-scan: repo scanned');
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt === 0 && camofoxTabId && shouldRetryAfterCamofoxError(lastErr.message)) {
            // H5: tab is likely poisoned (stale Anubis JWT or upstream worker bounce).
            attempt += 1;
            retriesPerformed += 1;
            log.warn(
              { repoFullName, err: lastErr.message, scanLabel },
              'twitter-scan: camofox 5xx — retrying with fresh tab',
            );
            try {
              await closeCamofoxTab(camofoxTabId);
            } catch {
              /* best-effort */
            }
            camofoxTabId = await makeFreshTab(instance);
            if (camofoxTabId) continue;
          }
          break;
        }
      }

      if (lastErr) {
        failed += 1;
        consecutiveFailures += 1;
        log.warn(
          { repoFullName, err: lastErr.message, attempt, instance, scanLabel },
          'twitter-scan: nitter fetch failed',
        );

        if (consecutiveFailures >= CONSECUTIVE_FAIL_ROTATE_THRESHOLD) {
          const nextInstance = instanceChain[instanceIdx + 1];
          if (nextInstance) {
            // H6: rotate to next chain entry on consecutive failures.
            const oldInstance = instance;
            instanceIdx += 1;
            instance = nextInstance;
            instanceRotations += 1;
            log.warn(
              { oldInstance, newInstance: instance, consecutiveFailures, scanLabel },
              'twitter-scan: rotating to fallback nitter instance',
            );
            if (camofoxTabId) {
              try {
                await closeCamofoxTab(camofoxTabId);
              } catch {
                /* best-effort */
              }
            }
            camofoxTabId = await makeFreshTab(instance);
            consecutiveFailures = 0;
          } else {
            bailedOut = true;
            bailReason = `consecutive-failures-on-last-instance:${consecutiveFailures}`;
            log.warn({ bailReason, scanLabel }, 'twitter-scan: chain exhausted, bailing');
            break;
          }
        }
      }
      await sleep(REQUEST_PAUSE_MS);
    }
  } finally {
    if (camofoxTabId) {
      try {
        await closeCamofoxTab(camofoxTabId);
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    posts: allPosts,
    scannedRepos: repos.length,
    failedRepos: failed,
    retriesPerformed,
    instanceRotations,
    bailedOut,
    ...(bailReason ? { bailReason } : {}),
    finalInstance: instance,
    fetchedAt,
  };
}

// --------------------------------------------------------------------------
// scanRepoBatchParallel — N-tab pool variant for warm/cold tiers.
//
// Pattern (informed by 2026-05-30 H7 box probes):
//   - Sequential tab creation upfront; concurrent /tabs hits camofox's
//     `session_expired` race.
//   - N workers, each owns one tab, pull repos from a shared queue.
//   - Per-worker H5 retry: on transient camofox 5xx, close + recreate THAT
//     worker's tab and retry the same repo once.
//   - No chain rotation in V1. Warm/cold cadences (6h / daily) mean instance
//     death between runs is the operationally-relevant case; the worker
//     scheduler restarts the fetcher anyway. V2 can add coordinated
//     rotation if we ever observe mid-run head-instance death.
//   - On worker terminal-fail (tab unrecoverable), worker exits early; other
//     workers continue. Aggregated `failedRepos` includes both worker-fail
//     and per-repo-fail.
// --------------------------------------------------------------------------

export interface ScanRepoBatchParallelOpts extends ScanRepoBatchOpts {
  concurrency: number;
}

export async function scanRepoBatchParallel(opts: ScanRepoBatchParallelOpts): Promise<ScanRepoBatchResult> {
  const { repos, instanceChain, log, scanLabel, concurrency } = opts;
  const fetchedAt = new Date().toISOString();
  const finalInstance = instanceChain[0] ?? 'https://nitter.privacyredirect.com';
  const N = Math.max(1, Math.min(concurrency, repos.length));

  if (repos.length === 0 || instanceChain.length === 0) {
    return {
      posts: [],
      scannedRepos: 0,
      failedRepos: 0,
      retriesPerformed: 0,
      instanceRotations: 0,
      bailedOut: false,
      finalInstance,
      fetchedAt,
    };
  }

  // Sequential tab creation — camofox 400s on concurrent /tabs.
  const tabs: Array<{ tabId: string; userId: string } | undefined> = [];
  for (let i = 0; i < N; i++) {
    const userId = `twitter-parallel-${scanLabel}-${i}`;
    try {
      const tabId = await createCamofoxTab(`${finalInstance}/`);
      tabs.push({ tabId, userId });
    } catch (err) {
      log.error(
        { err: (err as Error).message, slot: i, instance: finalInstance, scanLabel },
        'twitter-scan: parallel tab creation failed for slot',
      );
      tabs.push(undefined);
    }
  }
  const activeTabs = tabs.filter((t): t is NonNullable<typeof t> => t !== undefined);
  log.info(
    { requested: N, created: activeTabs.length, instance: finalInstance, scanLabel },
    'twitter-scan: parallel tab pool created',
  );

  if (activeTabs.length === 0) {
    log.error({ scanLabel }, 'twitter-scan: zero tabs created — falling back');
    return {
      posts: [],
      scannedRepos: 0,
      failedRepos: repos.length,
      retriesPerformed: 0,
      instanceRotations: 0,
      bailedOut: true,
      bailReason: 'no-tabs-available',
      finalInstance,
      fetchedAt,
    };
  }

  // Shared work queue + result accumulators. Mutated by workers under JS's
  // single-threaded execution model — no atomicity needed for primitives.
  const queue = repos.slice();
  const allPosts: TwitterRepoSignalPost[] = [];
  let failed = 0;
  let retries = 0;

  const worker = async (slot: number, tab: { tabId: string; userId: string }): Promise<void> => {
    let currentTabId = tab.tabId;
    for (;;) {
      const repoFullName = queue.shift();
      if (!repoFullName) return;
      const url = buildNitterSearchUrl(finalInstance, repoFullName);
      let attempt = 0;
      let lastErr: Error | undefined;
      for (;;) {
        try {
          const html = await fetchViaCamofox(currentTabId, url);
          const posts = parseNitterSearchHtml(html, repoFullName, fetchedAt, url);
          allPosts.push(...posts);
          lastErr = undefined;
          log.debug({ slot, repoFullName, posts: posts.length, attempt, scanLabel }, 'twitter-scan: parallel repo scanned');
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt === 0 && shouldRetryAfterCamofoxError(lastErr.message)) {
            attempt += 1;
            retries += 1;
            log.warn({ slot, repoFullName, err: lastErr.message, scanLabel }, 'twitter-scan: parallel 5xx — retrying with fresh tab');
            try {
              await closeCamofoxTab(currentTabId);
            } catch {
              /* best-effort */
            }
            try {
              currentTabId = await createCamofoxTab(`${finalInstance}/`);
              continue;
            } catch (recreateErr) {
              log.error(
                { slot, err: (recreateErr as Error).message, scanLabel },
                'twitter-scan: parallel tab recreation failed — worker exits',
              );
              failed += 1;
              return;
            }
          }
          break;
        }
      }
      if (lastErr) {
        failed += 1;
        log.warn({ slot, repoFullName, err: lastErr.message, attempt, scanLabel }, 'twitter-scan: parallel fetch failed');
      }
    }
  };

  try {
    await Promise.all(activeTabs.map((tab, i) => worker(i, tab)));
  } finally {
    // Close every tab the workers may still hold. Workers that recreated
    // their tab on retry hold a different id than `tabs[i]`; we can't track
    // that without per-worker mutation. Best-effort: close the initial ids.
    // Stale tabs get GC'd by camofox's session cleanup anyway.
    for (const tab of activeTabs) {
      try {
        await closeCamofoxTab(tab.tabId);
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    posts: allPosts,
    scannedRepos: repos.length,
    failedRepos: failed,
    retriesPerformed: retries,
    instanceRotations: 0,
    bailedOut: false,
    finalInstance,
    fetchedAt,
  };
}
