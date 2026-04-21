// StarScreener Pipeline — historical stargazer backfill.
//
// Reconstructs 30 daily RepoSnapshot points by walking the `/stargazers`
// endpoint with the `Accept: application/vnd.github.star+json` media type,
// which returns `{ starred_at, user }[]`. We bucket the timestamps by day,
// then replay cumulative star totals from today backwards so the delta
// engine has real historical data to compute 24h/7d/30d growth against.
//
// Hard guards:
//   - `X-RateLimit-Remaining < 200` → abort immediately (preserve budget for
//     the scheduled ingest cron and any other callers).
//   - `maxPages` defaults to 50 (5000 stargazers). Older history is lost for
//     repos with >5000 total stars — acceptable for MVP, GitHub's stargazer
//     endpoint is ordered oldest-first so walking further back costs pages
//     in proportion to total stars.
//   - NO mock fallback. Any error → throw or return zero-write result.

import type { PipelineStores } from "../storage/singleton";
import type { RepoSnapshot } from "../types";

const GITHUB_API = "https://api.github.com";
const ONE_DAY_MS = 86_400_000;

export interface StargazerBackfillOptions {
  /** Max pages of 100 to fetch. Defaults to 50 (5000 stargazers). */
  maxPages?: number;
}

export interface StargazerBackfillResult {
  snapshotsWritten: number;
  daysCovered: number;
  rateLimitRemaining: number | null;
  /**
   * When we couldn't walk back far enough to cover the last 30 days. Set
   * when the repo's recent-history tail wasn't reachable (usually because
   * stars > 40k and GitHub's list cap at page 400 cuts off access to the
   * most recent stargazers).
   */
  skipped?: "exceeds_list_cap" | "no_stars";
}

// GitHub caps every paginated list at 400 pages. For the stargazers endpoint
// that means we can never see past the oldest 40,000 stargazers — for any
// repo with more stars than that, the /stargazers endpoint cannot surface
// recent history, so reconstruction would produce zeros. Clients should fall
// back to the ongoing snapshot cron (hourly/daily) which builds real history
// forward in time.
const GITHUB_LIST_CAP_PAGES = 400;

interface StargazerPageEntry {
  starred_at: string;
  user: { login?: string } | null;
}

/**
 * Walk `/repos/{owner}/{name}/stargazers` until we run out of pages, our page
 * budget, or the rate limit drops below 200. Writes 30 backdated snapshots
 * spanning today → 29 days ago reconstructed from per-day star counts.
 *
 * Returns zero-write result when the repo isn't in the store or has no stars
 * visible through the stargazer endpoint.
 */
export async function backfillStargazerHistory(
  fullName: string,
  token: string,
  stores: PipelineStores,
  opts: StargazerBackfillOptions = {},
): Promise<StargazerBackfillResult> {
  if (!token) {
    throw new Error(
      "backfillStargazerHistory: token is required. The stargazer endpoint " +
        "requires a GitHub PAT to stay under the 60/hr unauthenticated limit.",
    );
  }

  const repo = stores.repoStore.getByFullName(fullName);
  if (!repo) {
    // Backfilling an un-ingested repo would produce orphan snapshots with no
    // Repo row to decorate them — bail rather than pollute the store.
    return { snapshotsWritten: 0, daysCovered: 0, rateLimitRemaining: null };
  }

  const maxPages = opts.maxPages ?? 50;
  const perDay = new Map<string, number>(); // YYYY-MM-DD → stars added that day
  let totalFetched = 0;
  let rateLimitRemaining: number | null = null;

  // GitHub returns stargazers oldest-first. For repos with many stars we need
  // the most RECENT batch, so probe page=1 via a GET (HEAD drops Link on some
  // paths) to read `Link: ...; rel="last"` and start from there.
  let startPage = 1;
  let lastPage = 1;
  {
    const probeUrl = `${GITHUB_API}/repos/${fullName}/stargazers?per_page=100&page=1`;
    const probe = await fetch(probeUrl, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github.star+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TrendingRepo",
      },
    });
    const link = probe.headers.get("link");
    if (link) {
      const m = link.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
      if (m) {
        lastPage = Number.parseInt(m[1], 10);
        if (!Number.isFinite(lastPage) || lastPage <= 0) lastPage = 1;
      }
    }
    const probeRem = probe.headers.get("x-ratelimit-remaining");
    if (probeRem !== null) {
      const parsed = Number.parseInt(probeRem, 10);
      if (Number.isFinite(parsed)) rateLimitRemaining = parsed;
    }

    // If the repo has more stars than GitHub's 400-page list cap can expose,
    // recent stargazers are unreachable — abort rather than write zero-delta
    // snapshots that would make sparklines look flat-fake. The hourly
    // snapshot cron will build forward history for these repos over time.
    if (lastPage >= GITHUB_LIST_CAP_PAGES) {
      console.warn(
        `[stargazer-backfill] ${fullName} stars=${repo.stars} exceeds GitHub's ${GITHUB_LIST_CAP_PAGES}-page list cap; skipping backfill (history will accumulate via the snapshot cron)`,
      );
      return {
        snapshotsWritten: 0,
        daysCovered: 0,
        rateLimitRemaining,
        skipped: "exceeds_list_cap",
      };
    }

    // Consume and bucket the probe's own page body so we don't waste the
    // request — it's page 1 of real data for small repos where we'll walk
    // the whole list anyway.
    if (probe.ok) {
      const count = await safeReadPage(probe, perDay);
      totalFetched += 1;
      startPage = Math.max(2, lastPage - maxPages + 1);
    } else {
      console.error(
        `[stargazer-backfill] ${fullName} probe failed: ${probe.status}`,
      );
      throw new Error(
        `stargazer probe ${fullName} failed: ${probe.status} ${probe.statusText}`,
      );
    }
  }

  for (let page = startPage; page <= lastPage; page++) {
    const url = `${GITHUB_API}/repos/${fullName}/stargazers?per_page=100&page=${page}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github.star+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TrendingRepo",
      },
    });

    // Extract rate-limit info on every response so we stay observable even
    // when aborting early.
    const remainingHeader = res.headers.get("x-ratelimit-remaining");
    if (remainingHeader !== null) {
      const parsed = Number.parseInt(remainingHeader, 10);
      if (Number.isFinite(parsed)) {
        rateLimitRemaining = parsed;
      }
    }

    if (!res.ok) {
      console.error(
        `[stargazer-backfill] ${fullName} page ${page} failed: ${res.status} ${res.statusText}`,
      );
      // No silent fallback — surface the failure to the caller.
      throw new Error(
        `stargazer fetch ${fullName} page ${page} failed: ${res.status} ${res.statusText}`,
      );
    }

    // Preserve rate-limit budget for other callers (ingest cron, UI probes).
    if (rateLimitRemaining !== null && rateLimitRemaining < 200) {
      console.warn(
        `[stargazer-backfill] rate limit tight (${rateLimitRemaining} remaining) — aborting after page ${page}`,
      );
      // Still consume the body we already fetched so the connection returns
      // to the pool cleanly.
      await safeReadPage(res, perDay);
      totalFetched += 1;
      break;
    }

    const count = await safeReadPage(res, perDay);
    totalFetched += 1;

    // Short-circuit when the page was smaller than a full batch — we hit EOF.
    if (count < 100) {
      break;
    }
  }

  if (totalFetched === 0 || perDay.size === 0) {
    return { snapshotsWritten: 0, daysCovered: 0, rateLimitRemaining };
  }

  // Reconstruct cumulative totals for the last 30 days, working backwards
  // from today. currentStars is the latest known total — we peel off the
  // stars gained each day to get the count as it was at the start of that
  // day.
  const currentStars = repo.stars;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const snapshots: RepoSnapshot[] = [];
  let runningTotal = currentStars;
  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const bucketDate = new Date(today.getTime() - daysAgo * ONE_DAY_MS);
    const bucketKey = bucketDate.toISOString().slice(0, 10);
    const starsGainedThatDay = perDay.get(bucketKey) ?? 0;

    // Capture the total at end-of-day (23:59:59Z) so snapshot ordering is
    // stable and deltas over aligned windows land on calendar boundaries.
    const capturedAt = new Date(
      bucketDate.getTime() + 86_399_000,
    ).toISOString();

    const snap: RepoSnapshot = {
      id: `${repo.id}:${capturedAt}`,
      repoId: repo.id,
      capturedAt,
      source: "github",
      stars: runningTotal,
      forks: repo.forks,
      openIssues: repo.openIssues,
      watchers: repo.stars,
      contributors: repo.contributors,
      sizeKb: 0,
      lastCommitAt: repo.lastCommitAt ?? null,
      lastReleaseAt: repo.lastReleaseAt ?? null,
      lastReleaseTag: repo.lastReleaseTag ?? null,
      mentionCount24h: repo.mentionCount24h,
      socialBuzzScore: repo.socialBuzzScore,
    };
    snapshots.push(snap);

    // Step backwards: the day BEFORE `bucketKey` ended with
    // (runningTotal - starsGainedThatDay) stars.
    runningTotal = Math.max(0, runningTotal - starsGainedThatDay);
  }

  // Append oldest-first so the store's newest-first listings see the newest
  // day on top without extra sorting work.
  for (let i = snapshots.length - 1; i >= 0; i--) {
    stores.snapshotStore.append(snapshots[i]);
  }

  return {
    snapshotsWritten: snapshots.length,
    daysCovered: perDay.size,
    rateLimitRemaining,
  };
}

/**
 * Read a single stargazers page, bucket entries into `perDay`, and return the
 * number of entries seen on this page. Non-array responses are treated as
 * empty (GitHub occasionally returns `{message: ...}` on edge cases).
 */
async function safeReadPage(
  res: Response,
  perDay: Map<string, number>,
): Promise<number> {
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    console.error("[stargazer-backfill] page parse error", err);
    return 0;
  }
  if (!Array.isArray(raw)) return 0;

  let count = 0;
  for (const entry of raw as StargazerPageEntry[]) {
    count += 1;
    if (!entry || typeof entry.starred_at !== "string") continue;
    const day = entry.starred_at.slice(0, 10); // "YYYY-MM-DD"
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return count;
}
