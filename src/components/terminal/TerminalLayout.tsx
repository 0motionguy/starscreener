// StarScreener — TerminalLayout (Phase 2G, split for server/client boundary)
//
// SERVER COMPONENT. Renders the heading, the server-rendered FilterBar
// (which reads the pipeline facade synchronously), then delegates the
// filter + sort + Terminal render to the client-side TerminalBody.
// This split keeps node:fs (pulled in by the pipeline persistence layer)
// out of the client bundle.

import type { ReactNode } from "react";
import type { FilterBarVariant, Repo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilterBar } from "./FilterBar";
import { TerminalBody } from "./TerminalBody";

export interface TerminalLayoutProps {
  /** Source repos for this surface. Filter + sort hooks narrow from here. */
  repos: Repo[];
  /** Which FilterBar preset to render. Defaults to `"full"`. */
  filterBarVariant?: FilterBarVariant;
  /** Show the Featured Now horizontal scroll row. Defaults to `true`. */
  showFeatured?: boolean;
  /** Featured card cap. Defaults to `8`. */
  featuredCount?: number;
  /** Optional section title override for the Featured row. */
  featuredTitle?: string;
  /** Optional page heading slot rendered above the FilterBar. */
  heading?: ReactNode;
  /** Optional replacement for the default empty state. */
  emptyState?: ReactNode;
  /** Extra per-row action affordances plumbed into Terminal rows. */
  rowActions?: Array<"remove" | "compare" | "watch">;
  /** Optional wrapper class. */
  className?: string;
}

export function TerminalLayout(props: TerminalLayoutProps) {
  const {
    repos,
    filterBarVariant = "full",
    showFeatured = true,
    featuredCount = 8,
    featuredTitle,
    heading,
    emptyState,
    rowActions,
    className,
  } = props;

  return (
    <div className={cn("terminal-layout flex flex-col gap-6", className)}>
      {heading}
      <FilterBar variant={filterBarVariant} />
      <TerminalBody
        repos={repos}
        showFeatured={showFeatured}
        featuredCount={featuredCount}
        featuredTitle={featuredTitle}
        emptyState={emptyState}
        rowActions={rowActions}
      />
    </div>
  );
}
