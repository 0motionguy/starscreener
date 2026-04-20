// StarScreener — Pure filter + sort utilities for the terminal surface.
//
// No React, no hooks, no DOM. Safe to import from tests, server components,
// or API routes. Hooks layer (src/lib/hooks/*) wraps these with Zustand.

import type {
  ColumnId,
  MetaFilter,
  Repo,
  SortDirection,
  TerminalTab,
  TimeRange,
} from "./types";

const DAY_MS = 86_400_000;
const NEW_REPO_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Meta filter application
// ---------------------------------------------------------------------------

/**
 * Apply a "meta" (narrative) filter to a repo list. Meta filters are the
 * Dexscreener-style trending pills above the terminal: Hot / Breakouts /
 * Quiet Killers / New / Most Discussed / Rank Climbers / Fresh Releases.
 */
export function applyMetaFilter(repos: Repo[], filter: MetaFilter): Repo[] {
  switch (filter) {
    case "hot":
      return repos.filter((r) => r.movementStatus === "hot");
    case "breakouts":
      return repos.filter((r) => r.movementStatus === "breakout");
    case "quiet-killers":
      return repos.filter((r) => r.movementStatus === "quiet_killer");
    case "new": {
      const cutoff = Date.now() - 30 * 86_400_000;
      return repos.filter((r) => Date.parse(r.createdAt) > cutoff);
    }
    case "discussed":
      return repos.filter((r) => r.mentionCount24h > 0);
    case "rank-climbers": {
      // Placeholder: previousRank not tracked yet; use rank 1-20 as "climbers".
      return repos.filter((r) => r.rank >= 1 && r.rank <= 20);
    }
    case "fresh-releases": {
      const cutoff = Date.now() - 14 * 86_400_000;
      return repos.filter(
        (r) => r.lastReleaseAt && Date.parse(r.lastReleaseAt) > cutoff,
      );
    }
  }
}

function isDeltaColumn(column: ColumnId): boolean {
  return column === "delta24h" || column === "delta7d" || column === "delta30d";
}

export function isRepoNew(
  repo: Repo,
  nowMs: number = Date.now(),
  windowDays: number = NEW_REPO_WINDOW_DAYS,
): boolean {
  const createdAt = Date.parse(repo.createdAt);
  if (Number.isFinite(createdAt)) {
    return nowMs - createdAt <= windowDays * DAY_MS;
  }

  const lastCommitAt = Date.parse(repo.lastCommitAt);
  if (!Number.isFinite(lastCommitAt)) return false;
  return nowMs - lastCommitAt <= Math.min(windowDays, 14) * DAY_MS;
}

export function applyTerminalTabFilter(
  repos: Repo[],
  tab: TerminalTab,
  watchedRepoIds: string[] = [],
  nowMs: number = Date.now(),
): Repo[] {
  if (tab === "watchlisted") {
    if (watchedRepoIds.length === 0) return [];
    const watched = new Set(watchedRepoIds);
    return repos.filter((repo) => watched.has(repo.id));
  }

  if (tab === "new") {
    return repos.filter((repo) => isRepoNew(repo, nowMs));
  }

  return repos;
}

export function timeRangeToDeltaColumn(timeRange: TimeRange): ColumnId {
  switch (timeRange) {
    case "24h":
      return "delta24h";
    case "7d":
      return "delta7d";
    case "30d":
      return "delta30d";
  }
}

export function trendScoreForTimeRange(repo: Repo, timeRange: TimeRange): number {
  switch (timeRange) {
    case "24h":
      return repo.trendScore24h ?? 0;
    case "7d":
      return repo.trendScore7d ?? 0;
    case "30d":
      return repo.trendScore30d ?? 0;
  }
}

export function getEffectiveSortColumn(
  sortColumn: ColumnId,
  activeTab: TerminalTab,
  timeRange: TimeRange,
): ColumnId {
  if (activeTab === "gainers" && isDeltaColumn(sortColumn)) {
    return timeRangeToDeltaColumn(timeRange);
  }
  return sortColumn;
}

// ---------------------------------------------------------------------------
// Column sort
// ---------------------------------------------------------------------------

/**
 * Sort a repo list by a terminal column id + direction. Returns a new array;
 * the input is not mutated.
 */
export function sortReposByColumn(
  repos: Repo[],
  column: ColumnId,
  direction: SortDirection,
): Repo[] {
  const extract = getSortExtractor(column);
  const sorted = [...repos].sort((a, b) => {
    const av = extract(a);
    const bv = extract(b);
    if (typeof av === "number" && typeof bv === "number") {
      return direction === "asc" ? av - bv : bv - av;
    }
    const as = String(av ?? "");
    const bs = String(bv ?? "");
    return direction === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
  });
  return sorted;
}

/**
 * Per-column extractor used by {@link sortReposByColumn}. Delta columns
 * normalize by current star count so repos of wildly different sizes are
 * comparable on % basis. Date columns return epoch millis (0 when null).
 */
function getSortExtractor(column: ColumnId): (r: Repo) => number | string {
  switch (column) {
    case "rank":
      return (r) => r.rank;
    case "repo":
      return (r) => r.fullName;
    case "momentum":
      return (r) => r.momentumScore;
    case "stars":
      return (r) => r.stars;
    case "delta24h":
      return (r) => r.starsDelta24h / Math.max(r.stars, 1);
    case "delta7d":
      return (r) => r.starsDelta7d / Math.max(r.stars, 1);
    case "delta30d":
      return (r) => r.starsDelta30d / Math.max(r.stars, 1);
    case "chart":
      return (r) => r.starsDelta7d;
    case "forks":
      return (r) => r.forks;
    case "forksDelta7d":
      return (r) => r.forksDelta7d;
    case "contrib":
      return (r) => r.contributors;
    case "contribDelta30d":
      return (r) => r.contributorsDelta30d;
    case "issues":
      return (r) => r.openIssues;
    case "lastRelease":
      return (r) => (r.lastReleaseAt ? Date.parse(r.lastReleaseAt) : 0);
    case "lastCommit":
      return (r) => (r.lastCommitAt ? Date.parse(r.lastCommitAt) : 0);
    case "buzz":
      return (r) => r.socialBuzzScore;
    case "actions":
      return () => 0;
  }
}

export function sortReposForTerminal(
  repos: Repo[],
  options: {
    sortColumn: ColumnId;
    sortDirection: SortDirection;
    activeTab: TerminalTab;
    timeRange: TimeRange;
  },
): Repo[] {
  const { sortColumn, sortDirection, activeTab, timeRange } = options;
  const effectiveColumn = getEffectiveSortColumn(
    sortColumn,
    activeTab,
    timeRange,
  );

  if (activeTab === "trending" && sortColumn === "rank") {
    const directionMultiplier = sortDirection === "asc" ? -1 : 1;
    return [...repos].sort((a, b) => {
      const delta =
        trendScoreForTimeRange(a, timeRange) - trendScoreForTimeRange(b, timeRange);
      if (delta !== 0) return delta * directionMultiplier;
      return (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0);
    });
  }

  if (activeTab === "new" && sortColumn === "lastCommit") {
    return [...repos].sort((a, b) => {
      const av = Date.parse(a.createdAt);
      const bv = Date.parse(b.createdAt);
      const aValue = Number.isFinite(av) ? av : Date.parse(a.lastCommitAt) || 0;
      const bValue = Number.isFinite(bv) ? bv : Date.parse(b.lastCommitAt) || 0;
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
  }

  return sortReposByColumn(repos, effectiveColumn, sortDirection);
}

// ---------------------------------------------------------------------------
// Language extraction
// ---------------------------------------------------------------------------

/**
 * Collect the unique sorted list of languages present in a repo set. Used to
 * populate the sidebar language chip list at mount time.
 */
export function extractLanguages(repos: Repo[]): string[] {
  const set = new Set<string>();
  for (const r of repos) {
    if (r.language) set.add(r.language);
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Stars range check
// ---------------------------------------------------------------------------

/**
 * Inclusive bounds check against an optional `[min, max]` tuple. A null range
 * means "no filter" → everything passes.
 */
export function repoInStarsRange(
  repo: Repo,
  range: [number, number] | null,
): boolean {
  if (!range) return true;
  return repo.stars >= range[0] && repo.stars <= range[1];
}
