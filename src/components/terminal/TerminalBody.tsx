"use client";

// StarScreener — TerminalBody (client half of TerminalLayout)
//
// Owns the filter + sort hook pipeline and renders the featured row,
// the dense Terminal table, or an empty state. The server-side
// TerminalLayout renders FilterBar (which imports the pipeline facade)
// and hands the repos down to this client component so node:fs imports
// stay off the client bundle.

import type { ReactNode } from "react";
import type { Repo } from "@/lib/types";
import { useFilteredRepos } from "@/lib/hooks/useFilteredRepos";
import { useSortedRepos } from "@/lib/hooks/useSortedRepos";
import { FeaturedCards } from "./FeaturedCards";
import { Terminal } from "./Terminal";
import { TerminalEmpty } from "./TerminalEmpty";

export interface TerminalBodyProps {
  repos: Repo[];
  showFeatured: boolean;
  featuredCount: number;
  featuredTitle?: string;
  emptyState?: ReactNode;
  rowActions?: Array<"remove" | "compare" | "watch">;
}

export function TerminalBody(props: TerminalBodyProps) {
  const { repos, showFeatured, featuredCount, featuredTitle, emptyState, rowActions } = props;
  const filtered = useFilteredRepos(repos);
  const sorted = useSortedRepos(filtered);

  return (
    <>
      {showFeatured && filtered.length > 0 && (
        <div className="px-4 sm:px-6">
          <FeaturedCards limit={featuredCount} title={featuredTitle} />
        </div>
      )}

      <div className="px-0 sm:px-0">
        {sorted.length === 0 ? (
          emptyState ?? (
            <TerminalEmpty
              title="No repos match your filters"
              message="Try clearing a filter or selecting a different meta."
            />
          )
        ) : (
          <Terminal repos={sorted} rowActions={rowActions} />
        )}
      </div>
    </>
  );
}
