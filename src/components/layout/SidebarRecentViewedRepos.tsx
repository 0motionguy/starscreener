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
import Link from "next/link";
import { Clock } from "lucide-react";
import {
  readRecentViewedRepos,
  RECENT_VIEWED_REPOS_KEY,
  type RecentViewedRepo,
} from "@/lib/recent-viewed-repos";

const PREVIEW_LIMIT = 5;

export function SidebarRecentViewedRepos() {
  const [repos, setRepos] = useState<RecentViewedRepo[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRepos(readRecentViewedRepos());
    setMounted(true);
    // Sync across tabs — when another tab opens a repo detail page,
    // refresh this widget without requiring a navigation.
    function onStorage(e: StorageEvent) {
      if (e.key === RECENT_VIEWED_REPOS_KEY) {
        setRepos(readRecentViewedRepos());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!mounted || repos.length === 0) {
    // SSR + first-visit users: render nothing. The section header in
    // SidebarContent is responsible for hiding itself if desired.
    return null;
  }

  const top = repos.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col">
      {top.map((repo) => (
        <Link
          key={repo.fullName}
          href={`/repo/${repo.owner}/${repo.name}`}
          className="grid grid-cols-[14px_1fr] gap-2 items-center px-3 h-8 hover:bg-bg-card-hover transition-colors"
          title={repo.fullName}
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
        </Link>
      ))}
    </div>
  );
}
