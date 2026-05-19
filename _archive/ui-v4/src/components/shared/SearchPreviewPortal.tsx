"use client";

import { createPortal } from "react-dom";

import { BrandStar } from "@/components/shared/BrandStar";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";
import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

export interface SearchPreviewAnchorRect {
  left: number;
  top: number;
  width: number;
}

export interface SearchPreviewPortalProps {
  anchorRect: SearchPreviewAnchorRect;
  value: string;
  previewLoading: boolean;
  previewResults: Repo[];
  highlight: number;
  onHighlight: (index: number) => void;
  onSelect: (repo: Repo) => void;
  onSeeAll: () => void;
}

export function SearchPreviewPortal({
  anchorRect,
  value,
  previewLoading,
  previewResults,
  highlight,
  onHighlight,
  onSelect,
  onSeeAll,
}: SearchPreviewPortalProps): React.ReactElement {
  return createPortal(
    <div
      id="search-preview"
      role="listbox"
      style={{
        position: "fixed",
        left: anchorRect.left,
        top: anchorRect.top,
        width: anchorRect.width,
        zIndex: 9999,
      }}
      className={cn("v2-card shadow-popover", "overflow-hidden")}
    >
      {previewLoading && previewResults.length === 0 ? (
        <div className="px-3 py-4 text-xs text-text-tertiary font-mono text-center">
          Searching...
        </div>
      ) : previewResults.length === 0 ? (
        <div className="px-3 py-4 text-xs text-text-tertiary font-mono text-center">
          No matches for &ldquo;{value.trim()}&rdquo;
        </div>
      ) : (
        <ul className="max-h-[360px] overflow-y-auto bg-bg-card">
          {previewResults.map((repo, i) => (
            <li key={repo.id} className="bg-bg-card">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => onHighlight(i)}
                onClick={() => onSelect(repo)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left",
                  "transition-colors",
                  i === highlight
                    ? "bg-bg-tertiary"
                    : "hover:bg-bg-tertiary/60",
                )}
              >
                <EntityLogo
                  src={repoDisplayLogoUrl(
                    repo.fullName,
                    repo.ownerAvatarUrl,
                    20,
                  )}
                  name={repo.fullName}
                  size={20}
                  shape="circle"
                  alt=""
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                  {repo.fullName}
                </span>
                {repo.language && (
                  <span className="hidden sm:inline text-[10px] font-mono text-text-tertiary whitespace-nowrap">
                    {repo.language}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-tertiary tabular-nums whitespace-nowrap">
                  <BrandStar size={10} className="text-[var(--v4-amber)]" />
                  {formatNumber(repo.stars)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border-primary px-3 py-1.5 text-[10px] font-mono text-text-muted flex items-center justify-between bg-bg-card">
        <span>Up/Down to navigate - Enter to open</span>
        <button
          type="button"
          onClick={onSeeAll}
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          See all results -&gt;
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default SearchPreviewPortal;
