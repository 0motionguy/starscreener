"use client";

import { Code2, Rows3, Rows4, X } from "lucide-react";
import { SidebarFooterControlsLazy } from "./SidebarFooterControlsLazy";

const REPO_URL = "https://github.com/0motionguy/starscreener";
const AUTHOR_TWITTER_URL = "https://x.com/0motionguy";

interface SidebarFooterProps {
  /** Whether the sidebar is in compact density mode. Drives the toggle icon + label. */
  compact?: boolean;
  onToggleCompact?: () => void;
}

export function SidebarFooter({ compact, onToggleCompact }: SidebarFooterProps = {}) {
  return (
    <div
      className="shrink-0 space-y-3 border-t px-3 py-3"
      style={{ borderColor: "var(--v4-line-100)" }}
    >
      <SidebarFooterControlsLazy />
      <div className="flex items-center gap-2">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="v3-button h-9 w-9 p-0"
        >
          <Code2 className="h-4 w-4" strokeWidth={2} />
        </a>
        <a
          href={AUTHOR_TWITTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Author on X / Twitter"
          className="v3-button h-9 w-9 p-0"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </a>
        {onToggleCompact ? (
          <button
            type="button"
            onClick={onToggleCompact}
            aria-label={compact ? "Switch to comfortable density" : "Switch to compact density"}
            aria-pressed={!!compact}
            title={compact ? "Comfortable density" : "Compact density"}
            className="v3-button h-9 w-9 p-0 ml-auto"
          >
            {compact ? (
              <Rows4 className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Rows3 className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
