"use client";

import Link from "next/link";
import { History } from "lucide-react";

export interface SidebarRecentViewedPreviewRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
}

export function SidebarRecentViewedPreview({
  repos,
}: {
  repos: SidebarRecentViewedPreviewRepo[];
}) {
  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center text-center px-3 py-6 gap-2">
        <History className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
        <span className="text-[12px] font-medium text-text-secondary">
          No recent repo views
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {repos.slice(0, 5).map((repo) => (
        <Link
          key={repo.id}
          href={`/repo/${repo.owner}/${repo.name}`}
          className="px-3 h-9 flex items-center text-[12px] text-text-secondary hover:bg-bg-card-hover transition-colors truncate"
          title={repo.fullName}
        >
          {repo.fullName}
        </Link>
      ))}
    </div>
  );
}
