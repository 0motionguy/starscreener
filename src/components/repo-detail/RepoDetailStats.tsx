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
      className="v2-card overflow-hidden"
    >
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
        </span>
        <span
          className="flex-1 truncate"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {"// STATS · SNAPSHOT"}
        </span>
        <span
          className="v2-stat shrink-0 tabular-nums"
          style={{ color: "var(--v2-ink-300)" }}
          title="Momentum score (0-100)"
        >
          MOMENTUM{" "}
          <span style={{ color: "var(--v2-acc)" }}>
            {repo.momentumScore.toFixed(1)}
          </span>
        </span>
      </div>

      <div className="p-4">
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

        <div
          className="mt-4 pt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 v2-mono-tight"
          style={{
            fontSize: 11,
            borderTop: "1px solid var(--v2-line-std)",
          }}
        >
          <span style={{ color: "var(--v2-ink-400)" }}>{"// TREND"}</span>
          <DeltaChip label="24h" value={repo.starsDelta24h} />
          <DeltaChip label="7d" value={repo.starsDelta7d} />
          <DeltaChip label="30d" value={repo.starsDelta30d} />
        </div>
      </div>
    </section>
  );
}

function DeltaChip({ label, value }: { label: string; value: number }) {
  const tone = deltaTone(value);
  const color =
    tone === "up"
      ? "var(--v2-sig-green)"
      : tone === "down"
        ? "var(--v2-sig-red)"
        : "var(--v2-ink-400)";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span style={{ color: "var(--v2-ink-400)" }}>{label}</span>
      <span className="tabular-nums" style={{ color }}>
        {formatDelta(value)}
      </span>
      <span style={{ color: "var(--v2-ink-400)" }}>★</span>
    </span>
  );
}

export default RepoDetailStats;
