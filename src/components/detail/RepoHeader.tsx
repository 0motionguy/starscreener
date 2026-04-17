import Image from "next/image";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import { RankBadge } from "@/components/shared/RankBadge";
import { Star, GitFork, Users, CircleDot } from "lucide-react";

interface RepoHeaderProps {
  repo: Repo;
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  "C++": "#f34b7d",
  C: "#555555",
  Java: "#b07219",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Ruby: "#701516",
  Zig: "#ec915c",
  Scala: "#c22d40",
  Clojure: "#db5855",
  OCaml: "#3be133",
  Svelte: "#ff3e00",
  "Objective-C": "#438eff",
};

export function RepoHeader({ repo }: RepoHeaderProps) {
  const starsDelta7dPercent =
    repo.stars > 0 ? (repo.starsDelta7d / repo.stars) * 100 : 0;

  return (
    <section className="space-y-4 animate-fade-in">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <Image
          src={repo.ownerAvatarUrl}
          alt={repo.owner}
          width={32}
          height={32}
          className="rounded-full shrink-0 mt-1"
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary truncate">
            {repo.fullName}
          </h1>
          {repo.description && (
            <p className="text-text-secondary text-sm mt-1 leading-relaxed">
              {repo.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
        <div className="bg-bg-card rounded-card p-3 border shadow-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Star size={12} className="text-accent-amber shrink-0" />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Stars
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-text-primary">
              {formatNumber(repo.stars)}
            </span>
            <DeltaBadge value={starsDelta7dPercent} size="sm" />
          </div>
        </div>

        <div className="bg-bg-card rounded-card p-3 border shadow-card">
          <div className="flex items-center gap-1.5 mb-1">
            <GitFork size={12} className="text-accent-blue shrink-0" />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Forks
            </span>
          </div>
          <span className="font-mono text-xl font-bold text-text-primary">
            {formatNumber(repo.forks)}
          </span>
        </div>

        <div className="bg-bg-card rounded-card p-3 border shadow-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={12} className="text-accent-purple shrink-0" />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Contributors
            </span>
          </div>
          <span className="font-mono text-xl font-bold text-text-primary">
            {formatNumber(repo.contributors)}
          </span>
        </div>

        <div className="bg-bg-card rounded-card p-3 border shadow-card hidden md:block">
          <div className="flex items-center gap-1.5 mb-1">
            <CircleDot size={12} className="text-accent-amber shrink-0" />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Open Issues
            </span>
          </div>
          <span className="font-mono text-xl font-bold text-text-primary">
            {formatNumber(repo.openIssues)}
          </span>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryPill categoryId={repo.categoryId} size="md" />
        <MomentumBadge score={repo.momentumScore} size="md" showLabel />
        <RankBadge rank={repo.rank} size="md" />

        {repo.language && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-badge border border-border-primary text-text-secondary">
            <span
              className="shrink-0 size-2 rounded-full"
              style={{
                backgroundColor:
                  LANGUAGE_COLORS[repo.language] ?? "#6b7280",
              }}
              aria-hidden="true"
            />
            {repo.language}
          </span>
        )}
      </div>

      {/* Topics */}
      {repo.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {repo.topics.map((topic) => (
            <span
              key={topic}
              className="text-xs px-2 py-0.5 rounded-badge border border-border-primary text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
