import Image from "next/image";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { RankBadge } from "@/components/shared/RankBadge";
import { Star, GitFork, Users, CircleDot } from "lucide-react";

interface RepoHeaderProps {
  repo: Repo;
}

export function RepoHeader({ repo }: RepoHeaderProps) {
  const starsDelta7dPercent =
    repo.stars > 0 ? (repo.starsDelta7d / repo.stars) * 100 : 0;

  return (
    <section className="space-y-3 animate-fade-in">
      {/* Identity + inline stat row — stats are pulled up tight against the
          repo name per user feedback ("move the STATS closer to the
          projects"). Language pill + MomentumBadge removed from the header;
          both are available elsewhere (column picker / Why is this moving). */}
      <div className="flex items-start gap-3">
        <Image
          src={repo.ownerAvatarUrl}
          alt={repo.owner}
          width={32}
          height={32}
          unoptimized
          className="rounded-full shrink-0 mt-1"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-text-primary truncate">
            {repo.fullName}
          </h1>
          {repo.description && (
            <p className="text-text-secondary text-sm mt-1 leading-relaxed">
              {repo.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <CategoryPill categoryId={repo.categoryId} size="sm" />
            <RankBadge rank={repo.rank} size="sm" />
          </div>
        </div>
      </div>

      {/* Stats grid — pulled closer to the project (tighter top spacing). */}
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
