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
// Serial per-repo for V1. H7 will fold in N=4 parallel tabs by passing a
// concurrency limiter + tab pool here.

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
