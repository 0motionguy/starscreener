import Link from "next/link";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { Sparkline } from "@/components/shared/Sparkline";
import { Star } from "lucide-react";

interface RelatedReposProps {
  repos: Repo[];
}

export function RelatedRepos({ repos }: RelatedReposProps) {
  if (repos.length === 0) return null;

  return (
    <section className="space-y-3 animate-slide-up">
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
        Related Repos
      </h2>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {repos.map((repo) => {
          const delta7dPercent =
            repo.stars > 0
              ? (repo.starsDelta7d / repo.stars) * 100
              : 0;

          return (
            <Link
              key={repo.id}
              href={`/repo/${repo.owner}/${repo.name}`}
              className="min-w-[200px] bg-bg-card rounded-card p-3 border shadow-card hover:bg-bg-card-hover hover:shadow-card-hover transition-all shrink-0"
            >
              <p className="font-semibold text-text-primary text-sm truncate">
                {repo.fullName}
              </p>

              <div className="flex items-center gap-2 mt-1.5">
                <Star size={12} className="text-accent-amber shrink-0" />
                <span className="font-mono text-sm text-text-primary">
                  {formatNumber(repo.stars)}
                </span>
                <span
                  className={`font-mono text-xs font-bold ${
                    delta7dPercent >= 0
                      ? "text-accent-green"
                      : "text-accent-red"
                  }`}
                >
                  {delta7dPercent >= 0 ? "+" : ""}
                  {delta7dPercent.toFixed(1)}%
                </span>
              </div>

              <div className="mt-2">
                <Sparkline
                  data={repo.sparklineData}
                  width={60}
                  height={16}
                  positive={repo.starsDelta7d >= 0}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
