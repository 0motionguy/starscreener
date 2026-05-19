"use client";

/**
 * SidebarRecentViewedRepos — sidebar widget showing the last ~5 repos
 * the user opened on /repo/[owner]/[name]. Backed by localStorage via
 * `lib/recent-viewed-repos`. Renders nothing on SSR / first render to
 * keep server HTML stable, then hydrates with the stored list.
 *
 * Dedupe + MRU order is handled at write time by `trackRepoViewed` —
 * this component is a pure presentation layer.
 *
 * Empty state: no row is rendered at all. The parent `<V2Section>`
 * (mounted in SidebarContent) collapses cleanly — saves vertical
 * space for first-time visitors who have no history yet.
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  readRecentViewedRepos,
  RECENT_VIEWED_REPOS_EVENT,
  RECENT_VIEWED_REPOS_KEY,
  type RecentViewedRepo,
} from "@/lib/recent-viewed-repos";
import { RepoLink } from "@/components/repo/RepoLink";

const PREVIEW_LIMIT = 5;

export function SidebarRecentViewedRepos() {
  const [repos, setRepos] = useState<RecentViewedRepo[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function refreshRepos() {
      setRepos(readRecentViewedRepos());
    }

    refreshRepos();
    setMounted(true);
    // Sync across tabs — when another tab opens a repo detail page,
    // refresh this widget without requiring a navigation.
    function onStorage(e: StorageEvent) {
      if (e.key === RECENT_VIEWED_REPOS_KEY) {
        refreshRepos();
      }
    }
    function onRecentViewed() {
      refreshRepos();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(RECENT_VIEWED_REPOS_EVENT, onRecentViewed);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RECENT_VIEWED_REPOS_EVENT, onRecentViewed);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  if (repos.length === 0) {
    return (
      <div
        className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-400)" }}
      >
        None yet
      </div>
    );
  }

  const top = repos.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col">
      {top.map((repo) => (
        <RepoLink
          key={repo.fullName}
          owner={repo.owner}
          name={repo.name}
          className="grid grid-cols-[14px_1fr] gap-2 items-center px-3 h-8 hover:bg-bg-card-hover transition-colors"
        >
          <Clock
            className="w-3.5 h-3.5 shrink-0"
            strokeWidth={1.75}
            style={{ color: "var(--ink-300)" }}
            aria-hidden
          />
          <span
            className="text-[12px] truncate"
            style={{ color: "var(--ink-200)" }}
          >
            {repo.fullName}
          </span>
        </RepoLink>
      ))}
    </div>
  );
}
