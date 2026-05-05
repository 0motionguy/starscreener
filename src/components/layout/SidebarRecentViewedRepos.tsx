"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import {
  readRecentViewedRepos,
  getRecentViewedReposEvent,
  type RecentViewedRepoItem,
} from "@/lib/recent-viewed-repos";

const PREVIEW_LIMIT = 5;

function parseRepoId(repoId: string): { owner: string; name: string; fullName: string } | null {
  const parts = repoId.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1], fullName: repoId };
}

export function SidebarRecentViewedRepos() {
  const [repos, setRepos] = useState<RecentViewedRepoItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRepos(readRecentViewedRepos(window.localStorage));
    setMounted(true);
    function refresh() {
      setRepos(readRecentViewedRepos(window.localStorage));
    }
    window.addEventListener(getRecentViewedReposEvent(), refresh);
    return () => window.removeEventListener(getRecentViewedReposEvent(), refresh);
  }, []);

  if (!mounted || repos.length === 0) return null;

  const top = repos.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col">
      {top.map((item) => {
        const parsed = parseRepoId(item.repoId);
        if (!parsed) return null;
        return (
          <Link
            key={item.repoId}
            href={`/repo/${parsed.owner}/${parsed.name}`}
            className="grid grid-cols-[14px_1fr] gap-2 items-center px-3 h-8 hover:bg-bg-card-hover transition-colors"
            title={parsed.fullName}
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
              {parsed.fullName}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
