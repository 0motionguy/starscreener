const RECENT_VIEWED_REPOS_KEY = "trendingrepo-recent-viewed-repos";
const RECENT_VIEWED_REPOS_EVENT = "trendingrepo-recent-viewed-repos-changed";
const MAX_RECENT_VIEWED_REPOS = 5;

export interface RecentViewedRepoItem {
  repoId: string;
  viewedAt: string;
}

export function readRecentViewedRepos(
  storage: Storage,
): RecentViewedRepoItem[] {
  try {
    const raw = storage.getItem(RECENT_VIEWED_REPOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentViewedRepoItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { repoId?: unknown }).repoId === "string" &&
          typeof (item as { viewedAt?: unknown }).viewedAt === "string",
      )
      .slice(0, MAX_RECENT_VIEWED_REPOS);
  } catch {
    return [];
  }
}

export function writeRecentViewedRepos(
  storage: Storage,
  repos: RecentViewedRepoItem[],
) {
  storage.setItem(RECENT_VIEWED_REPOS_KEY, JSON.stringify(repos));
}

export function recordRecentRepoView(storage: Storage, repoId: string) {
  const now = new Date().toISOString();
  const current = readRecentViewedRepos(storage).filter((r) => r.repoId !== repoId);
  const next: RecentViewedRepoItem[] = [
    { repoId, viewedAt: now },
    ...current,
  ].slice(0, MAX_RECENT_VIEWED_REPOS);
  writeRecentViewedRepos(storage, next);
}

export function getRecentViewedReposKey(): string {
  return RECENT_VIEWED_REPOS_KEY;
}

export function getRecentViewedReposEvent(): string {
  return RECENT_VIEWED_REPOS_EVENT;
}
