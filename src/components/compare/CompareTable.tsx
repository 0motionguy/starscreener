"use client";

import type { Repo } from "@/lib/types";
import { formatNumber, getRelativeTime, cn } from "@/lib/utils";
import { Sparkline } from "@/components/shared/Sparkline";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import { CategoryPill } from "@/components/shared/CategoryPill";

interface CompareTableProps {
  repos: Repo[];
}

const COLUMN_COLORS = [
  "border-accent-green/30",
  "border-accent-blue/30",
  "border-accent-purple/30",
  "border-accent-amber/30",
];

const HEADER_COLORS = [
  "text-accent-green",
  "text-accent-blue",
  "text-accent-purple",
  "text-accent-amber",
];

interface MetricRow {
  label: string;
  key: string;
  render: (repo: Repo) => React.ReactNode;
  numeric?: (repo: Repo) => number;
}

const METRICS: MetricRow[] = [
  {
    label: "Stars",
    key: "stars",
    render: (r) => <span className="font-mono font-bold">{formatNumber(r.stars)}</span>,
    numeric: (r) => r.stars,
  },
  {
    label: "Forks",
    key: "forks",
    render: (r) => <span className="font-mono">{formatNumber(r.forks)}</span>,
    numeric: (r) => r.forks,
  },
  {
    label: "Contributors",
    key: "contributors",
    render: (r) => <span className="font-mono">{r.contributors.toLocaleString()}</span>,
    numeric: (r) => r.contributors,
  },
  {
    label: "Stars +24h",
    key: "stars24h",
    render: (r) => <DeltaBadge value={r.starsDelta24h} showBackground />,
    numeric: (r) => r.starsDelta24h,
  },
  {
    label: "Stars +7d",
    key: "stars7d",
    render: (r) => <DeltaBadge value={r.starsDelta7d} showBackground />,
    numeric: (r) => r.starsDelta7d,
  },
  {
    label: "Momentum",
    key: "momentum",
    render: (r) => <MomentumBadge score={r.momentumScore} showLabel />,
    numeric: (r) => r.momentumScore,
  },
  {
    label: "Language",
    key: "language",
    render: (r) => (
      <span className="text-sm text-text-primary">{r.language ?? "N/A"}</span>
    ),
  },
  {
    label: "Last Commit",
    key: "lastCommit",
    render: (r) => (
      <span className="text-sm text-text-secondary font-mono">
        {getRelativeTime(r.lastCommitAt)}
      </span>
    ),
  },
  {
    label: "Last Release",
    key: "lastRelease",
    render: (r) => (
      <span className="text-sm text-text-secondary font-mono">
        {r.lastReleaseAt ? getRelativeTime(r.lastReleaseAt) : "N/A"}
      </span>
    ),
  },
  {
    label: "Category",
    key: "category",
    render: (r) => <CategoryPill categoryId={r.categoryId} />,
  },
];

function findWinner(repos: Repo[], numericFn?: (r: Repo) => number): number {
  if (!numericFn || repos.length < 2) return -1;
  let maxIdx = 0;
  let maxVal = numericFn(repos[0]);
  for (let i = 1; i < repos.length; i++) {
    const val = numericFn(repos[i]);
    if (val > maxVal) {
      maxVal = val;
      maxIdx = i;
    }
  }
  // Only highlight if there's a clear winner (not all equal)
  const allEqual = repos.every((r) => numericFn(r) === maxVal);
  return allEqual ? -1 : maxIdx;
}

export function CompareTable({ repos }: CompareTableProps) {
  if (repos.length < 2) return null;

  return (
    <div className="bg-bg-card rounded-card border border-border-primary overflow-x-auto shadow-card animate-fade-in">
      <table className="w-full border-collapse min-w-[500px]">
        {/* Header row: repo names + mini sparklines */}
        <thead>
          <tr className="border-b border-border-primary">
            <th className="p-3 text-left text-xs text-text-tertiary font-medium uppercase tracking-wider w-[140px]">
              Metric
            </th>
            {repos.map((repo, i) => (
              <th
                key={repo.id}
                className={cn(
                  "p-3 text-center border-l border-border-primary",
                  COLUMN_COLORS[i],
                )}
              >
                <div className="flex flex-col items-center gap-1.5">
                  <span className={cn("text-sm font-bold", HEADER_COLORS[i])}>
                    {repo.fullName}
                  </span>
                  <Sparkline
                    data={repo.sparklineData}
                    width={40}
                    height={12}
                    positive={repo.starsDelta7d > 0}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Metric rows */}
        <tbody>
          {METRICS.map((metric) => {
            const winnerIdx = findWinner(repos, metric.numeric);
            return (
              <tr
                key={metric.key}
                className="border-b border-border-primary last:border-b-0 hover:bg-bg-card-hover/50 transition-colors"
              >
                <td className="p-3 text-sm text-text-tertiary font-medium">
                  {metric.label}
                </td>
                {repos.map((repo, i) => (
                  <td
                    key={repo.id}
                    className={cn(
                      "p-3 text-center border-l border-border-primary",
                      winnerIdx === i && "bg-accent-green/5",
                    )}
                  >
                    <div className="flex justify-center">
                      {metric.render(repo)}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
