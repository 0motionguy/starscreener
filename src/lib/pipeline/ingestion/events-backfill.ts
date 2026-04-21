// StarScreener — GitHub Events API backfill for mega-repos.
//
// Problem: the `/stargazers` endpoint paginates oldest-first and is hard-capped
// at 400 pages = 40,000 users. For any repo with >40k stars, stargazer backfill
// cannot reach recent starring activity, so 24h/7d deltas stay at zero until
// forward-capture snapshot crons accumulate enough history over time.
//
// Fix: the GitHub Events API (`/repos/{owner}/{repo}/events`) returns a feed
// of recent events including WatchEvent (star). It goes back ~90 days or 300
// events, whichever is smaller, and works for ANY repo size. We count
// WatchEvent occurrences per day to reconstruct the same daily star curve the
// stargazer endpoint would produce.
//
// Caveat: Events API is eventually consistent and caps at 300 events per repo
// per request. Very active repos (>300 events / 90d) will have truncated
// history, but 24h and 7d windows remain accurate because those are always
// the newest events.

import type { PipelineStores } from "../storage/singleton";
import type { RepoSnapshot } from "../types";

const GITHUB_API = "https://api.github.com";
const ONE_DAY_MS = 86_400_000;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * AbortSignal that fires after `ms`. Duplicate of the helper in the social
 * adapters and github-adapter.ts; H2-2 consolidates them. Kept local so the
 * Phase 2 P-118 patch (F-RES-001) is minimal-diff.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  type TimeoutFn = (ms: number) => AbortSignal;
  const native = (AbortSignal as unknown as { timeout?: TimeoutFn }).timeout;
  if (typeof native === "function") {
    return { signal: native.call(AbortSignal, ms), clear: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(handle),
  };
}

export interface EventsBackfillOptions {
  /** Days of history to reconstruct (max 90 per GitHub limit). Default 30. */
  days?: number;
  /** Max pages of 100 events to fetch. Default 3 = up to 300 events. */
  maxPages?: number;
}

export interface EventsBackfillResult {
  snapshotsWritten: number;
  daysCovered: number;
  watchEventsCounted: number;
  rateLimitRemaining: number | null;
  skipped?: "no_stars" | "repo_not_in_store";
}

interface GitHubEvent {
  type: string;
  created_at: string;
}

/**
 * Walk `/repos/{owner}/{name}/events`, filter to WatchEvent, bucket by day,
 * and write daily snapshots back-dating the current star count by the
 * observed deltas. Safe on repos of any star count.
 */
export async function backfillFromEvents(
  fullName: string,
  token: string,
  stores: PipelineStores,
  opts: EventsBackfillOptions = {},
): Promise<EventsBackfillResult> {
  if (!token) {
    throw new Error(
      "backfillFromEvents: token required — Events API rate-limited to 60/hr unauth.",
    );
  }
  const repo = stores.repoStore.getByFullName(fullName);
  if (!repo) {
    return {
      snapshotsWritten: 0,
      daysCovered: 0,
      watchEventsCounted: 0,
      rateLimitRemaining: null,
      skipped: "repo_not_in_store",
    };
  }
  if (repo.stars === 0) {
    return {
      snapshotsWritten: 0,
      daysCovered: 0,
      watchEventsCounted: 0,
      rateLimitRemaining: null,
      skipped: "no_stars",
    };
  }

  const days = Math.min(Math.max(opts.days ?? 30, 1), 90);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 3, 1), 10);

  const nowMs = Date.now();
  const cutoffMs = nowMs - days * ONE_DAY_MS;
  const perDay = new Map<string, number>(); // YYYY-MM-DD → stars added that day
  let watchEventsCounted = 0;
  let rateLimitRemaining: number | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const url = `${GITHUB_API}/repos/${fullName}/events?per_page=100&page=${page}`;
    const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "TrendingRepo",
        },
        signal,
      });
    } catch (err) {
      console.error(
        `[events-backfill] network error for ${fullName} page ${page}`,
        err,
      );
      break;
    } finally {
      clear();
    }
    const rlHeader = res.headers.get("x-ratelimit-remaining");
    if (rlHeader) rateLimitRemaining = parseInt(rlHeader, 10);

    if (!res.ok) break;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      break;
    }
    if (!Array.isArray(body)) break;
    const events = body as GitHubEvent[];
    if (events.length === 0) break;

    let reachedCutoff = false;
    for (const ev of events) {
      const tMs = Date.parse(ev.created_at);
      if (!Number.isFinite(tMs)) continue;
      if (tMs < cutoffMs) {
        reachedCutoff = true;
        break;
      }
      if (ev.type === "WatchEvent") {
        const dayKey = new Date(tMs).toISOString().slice(0, 10);
        perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);
        watchEventsCounted += 1;
      }
    }
    if (reachedCutoff) break;
    if (events.length < 100) break;
    if (rateLimitRemaining !== null && rateLimitRemaining < 200) break;
  }

  // Reconstruct daily cumulative star counts by walking backwards from today.
  // `currentStars` is today's total; subtract each day's observed delta to
  // recover the star count at each prior midnight.
  const snapshotsToWrite: RepoSnapshot[] = [];
  let running = repo.stars;
  for (let i = 0; i < days; i++) {
    const dayMs = nowMs - i * ONE_DAY_MS;
    const dayKey = new Date(dayMs).toISOString().slice(0, 10);
    const capturedAt = new Date(
      new Date(dayMs).setUTCHours(23, 59, 59, 999),
    ).toISOString();
    const delta = perDay.get(dayKey) ?? 0;
    snapshotsToWrite.push({
      id: `${repo.id}:${capturedAt}:github`,
      repoId: repo.id,
      capturedAt,
      source: "github",
      stars: running,
      forks: repo.forks,
      openIssues: repo.openIssues,
      watchers: running,
      contributors: repo.contributors,
      sizeKb: 0,
      lastCommitAt: repo.lastCommitAt ?? null,
      lastReleaseAt: repo.lastReleaseAt ?? null,
      lastReleaseTag: repo.lastReleaseTag ?? null,
      mentionCount24h: 0,
      socialBuzzScore: 0,
    });
    running = Math.max(0, running - delta);
  }

  // Append in chronological order (oldest first) so the store's sort keeps
  // today at the head.
  for (const s of snapshotsToWrite.reverse()) {
    stores.snapshotStore.append(s);
  }

  return {
    snapshotsWritten: snapshotsToWrite.length,
    daysCovered: days,
    watchEventsCounted,
    rateLimitRemaining,
  };
}
