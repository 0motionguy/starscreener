// CompareChipSelector — chip strip at the top of /tools/compare showing
// the selected repos with a remove × per chip and an "Add repo" pill that
// focuses the search picker above it (dispatches `compare:focus-search`).
//
// The empty-slot count is rendered as ghost pills, capped to the
// `maxRepos` cap the page enforces.

import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/lib/icons";
import type { Repo } from "@/lib/types";

import { CompareAddSlot } from "./CompareAddSlot";

interface CompareChipSelectorProps {
  /** Resolved repos currently in the comparison (server-side). */
  repos: Repo[];
  /** owner/name list — used to build remove-links. */
  selectedFullNames: string[];
  /** Hard cap on repos in the matrix. */
  maxRepos: number;
}

export function CompareChipSelector({
  repos,
  selectedFullNames,
  maxRepos,
}: CompareChipSelectorProps) {
  const empty = Math.max(0, maxRepos - repos.length);

  function removeHref(fullName: string): string {
    const remaining = selectedFullNames.filter(
      (fn) => fn.toLowerCase() !== fullName.toLowerCase(),
    );
    if (remaining.length === 0) return "/tools/compare";
    return `/tools/compare?repos=${remaining.map(encodeURIComponent).join(",")}`;
  }

  return (
    <div className="cmp-chip-bar" role="region" aria-label="Selected repos">
      <div className="cmp-chip-head">
        <span className="cmp-chip-eyebrow">{"// REPOS"}</span>
        <span className="cmp-chip-count">
          <b>{repos.length}</b> of {maxRepos}
        </span>
        {repos.length > 0 ? (
          <Link
            href="/tools/compare"
            prefetch={false}
            className="cmp-chip-clear-all"
            title="Remove every repo"
          >
            <Icon name="close" size="sm" /> Clear all
          </Link>
        ) : null}
      </div>
      <div className="cmp-chip-row">
        {repos.map((repo) => (
          <div key={repo.fullName} className="cmp-chip-pill">
            <span className="cmp-chip-avatar" aria-hidden="true">
              {repo.ownerAvatarUrl ? (
                <Image
                  src={repo.ownerAvatarUrl}
                  alt=""
                  width={18}
                  height={18}
                  unoptimized
                  style={{ borderRadius: 2, display: "block" }}
                />
              ) : (
                <span className="cmp-chip-mono">
                  {repo.owner.slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>
            <Link
              href={`/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`}
              prefetch={false}
              className="cmp-chip-name"
            >
              <span className="cmp-chip-owner">{repo.owner}/</span>
              {repo.name}
            </Link>
            <Link
              href={removeHref(repo.fullName)}
              prefetch={false}
              className="cmp-chip-remove"
              aria-label={`Remove ${repo.fullName} from comparison`}
              title="Remove from comparison"
            >
              <Icon name="close" size="sm" />
            </Link>
          </div>
        ))}
        {Array.from({ length: empty }).map((_, i) => (
          <CompareAddSlot key={`add-${i}`} index={repos.length + i + 1} />
        ))}
      </div>
      <div className="cmp-chip-hint">
        Press <kbd>⌘K</kbd> or <kbd>/</kbd> to focus search · up to {maxRepos} repos
      </div>
    </div>
  );
}
