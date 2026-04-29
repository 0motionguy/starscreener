"use client";

// StarScreener — StarterPackRow.
//
// Horizontal row of clickable "starter pack" chips for the /compare page.
// Each chip flattens a tier-list template's repo list (capped at the new
// MAX_COMPARE_REPOS) and hands the full names to the parent via onPick.
// The "+ MY STACK" chip pulls from the user's watchlist; if empty it's
// rendered disabled.

import { useMemo } from "react";
import { useWatchlistStore } from "@/lib/store";
import { TIER_LIST_TEMPLATES } from "@/lib/tier-list/templates";
import { MAX_COMPARE_REPOS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StarterPackRowProps {
  /** Called with the repo full-names when a pack chip is clicked. */
  onPick: (fullNames: string[]) => void;
  className?: string;
}

/**
 * Maps each chip to a template slug. Slugs that don't exist in
 * TIER_LIST_TEMPLATES are silently dropped so the row only ever renders
 * real packs.
 */
const TEMPLATE_PICKS: ReadonlyArray<{
  key: string;
  label: string;
  templateSlug: string;
}> = [
  { key: "ai-agents", label: "AI Agents", templateSlug: "ai-agent-frameworks" },
  { key: "code-editors", label: "Code Editors", templateSlug: "code-editor-agents" },
  { key: "rag", label: "RAG Stacks", templateSlug: "rag-stacks" },
  { key: "local-infer", label: "Local Infer", templateSlug: "local-inference" },
  { key: "mcp", label: "MCP Servers", templateSlug: "mcp-servers" },
];

/** Watchlist ids look like "vercel--next-js" — convert back to "vercel/next.js". */
function repoIdToFullName(id: string): string {
  const idx = id.indexOf("--");
  if (idx === -1) return id;
  return id.slice(0, idx) + "/" + id.slice(idx + 2);
}

const CHIP_BASE = cn(
  "inline-flex items-center gap-1.5",
  "px-3 py-1.5",
  "border border-border-primary",
  "bg-bg-secondary",
  "rounded-md",
  "font-mono text-[11px] tracking-[0.14em] uppercase",
  "text-text-secondary",
  "transition-colors",
);

const CHIP_INTERACTIVE = cn(
  "hover:bg-bg-tertiary hover:text-text-primary cursor-pointer",
);

const CHIP_DISABLED = cn("opacity-50 cursor-not-allowed");

export function StarterPackRow({ onPick, className }: StarterPackRowProps) {
  const watchlistRepos = useWatchlistStore((s) => s.repos);

  // Resolve template picks once — drop any slug that isn't actually
  // exported, so the row degrades gracefully if the template list shrinks.
  const packs = useMemo(
    () =>
      TEMPLATE_PICKS.flatMap((pick) => {
        const tpl = TIER_LIST_TEMPLATES.find((t) => t.slug === pick.templateSlug);
        if (!tpl) return [];
        const fullNames = tpl.repos.slice(0, MAX_COMPARE_REPOS);
        return [
          {
            key: pick.key,
            label: pick.label,
            count: fullNames.length,
            fullNames,
          },
        ];
      }),
    [],
  );

  const watchlistFullNames = useMemo(
    () =>
      watchlistRepos
        .map((r) => repoIdToFullName(r.repoId))
        .slice(0, MAX_COMPARE_REPOS),
    [watchlistRepos],
  );

  const watchlistCount = watchlistFullNames.length;
  const watchlistDisabled = watchlistCount === 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
    >
      <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-text-tertiary">
        Starter Packs
      </span>

      {packs.map((pack) => (
        <button
          key={pack.key}
          type="button"
          onClick={() => onPick(pack.fullNames)}
          className={cn(CHIP_BASE, CHIP_INTERACTIVE)}
        >
          <span>{pack.label}</span>
          <span className="text-text-tertiary" aria-hidden="true">
            ·
          </span>
          <span className="text-text-tertiary tabular-nums">{pack.count}</span>
        </button>
      ))}

      {watchlistDisabled ? (
        <span
          className={cn(CHIP_BASE, CHIP_DISABLED)}
          aria-disabled="true"
          title="Add repos to your watchlist first"
        >
          <span>+ My Stack</span>
          <span className="text-text-tertiary" aria-hidden="true">
            ·
          </span>
          <span className="text-text-tertiary tabular-nums">0</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onPick(watchlistFullNames)}
          className={cn(CHIP_BASE, CHIP_INTERACTIVE)}
        >
          <span>+ My Stack</span>
          <span className="text-text-tertiary" aria-hidden="true">
            ·
          </span>
          <span className="text-text-tertiary tabular-nums">
            {watchlistCount}
          </span>
        </button>
      )}
    </div>
  );
}
