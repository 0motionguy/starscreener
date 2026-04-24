// Stats grid for /repo/[owner]/[name].
//
// 6-up grid of compact stat tiles using the canonical StatIcon component
// (the same one RepoBannerCard uses on the compare page) so the typography
// + icon weight stay consistent across the app.
//
// Server component. Sources are repo-metadata.json (push date, openIssues
// canonical) and the derived Repo (stars, forks, contributors,
// lastReleaseAt/Tag). License/watchers/PRs aren't tracked in the static
// pipeline yet — so we surface what we have rather than fetching live
// from the GitHub API on every page load.

import type { JSX } from "react";
import {
  CircleDot,
  GitCommit,
  Package,
} from "lucide-react";
import type { Repo } from "@/lib/types";
import { StatIcon } from "@/components/compare/StatIcon";
import { formatNumber, getRelativeTime } from "@/lib/utils";

interface RepoDetailStatsProps {
  repo: Repo;
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

function deltaTone(n: number): "up" | "down" | "default" {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "default";
}

export function RepoDetailStats({ repo }: RepoDetailStatsProps): JSX.Element {
  const lastReleaseValue = repo.lastReleaseAt
    ? getRelativeTime(repo.lastReleaseAt)
    : "—";
  const lastReleaseHint = repo.lastReleaseAt
    ? `${repo.lastReleaseTag ?? "release"} · ${getRelativeTime(repo.lastReleaseAt)}`
    : "No release tracked";

  const lastCommitValue = repo.lastCommitAt
    ? getRelativeTime(repo.lastCommitAt)
    : "—";
  const lastCommitHint = repo.lastCommitAt
    ? `Last commit ${getRelativeTime(repo.lastCommitAt)}`
    : "Commit activity unknown";

  return (
    <section
      aria-label="Repo statistics"
      className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
    >
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-3">
        Stats
        <span className="ml-2 text-text-tertiary">{"// snapshot"}</span>
      </h2>

      {/*
        Stars / Forks / Contributors moved to RepoDetailStatsStrip — this
        grid keeps the secondary metadata (Issues, last commit, last
        release) so the page still surfaces it without duplicating the
        hero numbers shown by the strip.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-3">
        <StatIcon
          icon={CircleDot}
          label="Open Issues"
          value={formatNumber(repo.openIssues)}
          hint={`${repo.openIssues.toLocaleString("en-US")} open issues`}
        />
        <StatIcon
          icon={GitCommit}
          label="Last Commit"
          value={lastCommitValue}
          hint={lastCommitHint}
        />
        <StatIcon
          icon={Package}
          label={repo.lastReleaseTag ?? "Latest Release"}
          value={lastReleaseValue}
          hint={lastReleaseHint}
        />
      </div>

      {/* Sub-row: deltas as tiny inline trend chips. Compact, monospace,
          and only rendered when we actually have movement data — flat
          repos with zero deltas would otherwise show three "0"s. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-mono">
        <span className="text-text-tertiary">{"// trend"}</span>
        <DeltaChip label="24h" value={repo.starsDelta24h} />
        <DeltaChip label="7d" value={repo.starsDelta7d} />
        <DeltaChip label="30d" value={repo.starsDelta30d} />
        <span className="text-text-tertiary ml-auto">
          momentum:{" "}
          <span className="text-text-primary tabular-nums">
            {repo.momentumScore.toFixed(1)}
          </span>
        </span>
      </div>
    </section>
  );
}

function DeltaChip({ label, value }: { label: string; value: number }) {
  const tone = deltaTone(value);
  const cls =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : "text-text-tertiary";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-text-tertiary">{label}</span>
      <span className={`tabular-nums ${cls}`}>{formatDelta(value)}</span>
      <span className="text-text-tertiary">★</span>
    </span>
  );
}

export default RepoDetailStats;
