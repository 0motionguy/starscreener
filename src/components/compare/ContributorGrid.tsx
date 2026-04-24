import type { JSX } from "react";
import type { CompareRepoBundle } from "@/lib/github-compare";

interface ContributorGridProps {
  bundle: CompareRepoBundle;
  max?: number;
}

/**
 * Avatar grid of a repo's top-N contributors with a 1-line summary line below.
 */
export function ContributorGrid({
  bundle,
  max = 20,
}: ContributorGridProps): JSX.Element {
  const contributors = bundle.contributors ?? [];

  if (contributors.length === 0) {
    return (
      <span className="text-xs text-text-tertiary font-mono">
        No contributor data
      </span>
    );
  }

  const shown = contributors.slice(0, max);
  const totalContribs = shown.reduce((sum, c) => sum + c.contributions, 0);
  const top = shown[0];
  const topPct =
    totalContribs > 0 ? (top.contributions / totalContribs) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {shown.map((c) => (
          <a
            key={c.login}
            href={`https://github.com/${c.login}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${c.login} — ${c.contributions.toLocaleString("en-US")} contributions`}
            className="group relative block size-8 overflow-hidden rounded-full border border-border-primary hover:border-brand transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.avatarUrl}
              alt={c.login}
              width={32}
              height={32}
              loading="lazy"
              className="size-full object-cover"
            />
          </a>
        ))}
      </div>

      <p className="font-mono text-[11px] text-text-tertiary">
        <span className="text-text-secondary tabular-nums">
          {contributors.length}
        </span>{" "}
        contributors · top contributor{" "}
        <span className="text-text-secondary">{top.login}</span> (
        <span className="tabular-nums">{topPct.toFixed(1)}%</span>)
      </p>
    </div>
  );
}
