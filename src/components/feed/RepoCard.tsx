"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { Sparkline } from "@/components/shared/Sparkline";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import { RankBadge } from "@/components/shared/RankBadge";
import { RepoMentionBadges } from "@/components/repo-signals/RepoMentionBadges";
import { NpmBadge } from "@/components/npm/NpmBadge";
import { getNpmPackagesForRepo } from "@/lib/npm";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";

interface RepoCardProps {
  repo: Repo;
  index?: number;
  showRank?: boolean;
}

export function RepoCard({ repo, index = 0, showRank = false }: RepoCardProps) {
  const isHot = repo.movementStatus === "hot";
  const deltaPercent =
    repo.stars > 0 ? (repo.starsDelta7d / repo.stars) * 100 : 0;

  return (
    <Link
      href={`/repo/${repo.owner}/${repo.name}`}
      className={cn(
        "block bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]",
        "hover:shadow-[var(--shadow-card-hover)] hover:border-accent-green/30 hover:-translate-y-px",
        "transition-all duration-200",
        "animate-[slide-up_0.35s_ease-out_forwards] opacity-0",
        isHot && "animate-[heat-pulse_1.5s_ease-in-out_infinite]"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Row 1: Rank + Name + HN badge + Category */}
      <div className="flex items-center gap-2 min-w-0">
        {showRank && (
          <RankBadge rank={repo.rank} size="sm" className="shrink-0" />
        )}
        <EntityLogo
          src={repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 24)}
          name={repo.fullName}
          size={24}
          shape="square"
          alt=""
        />
        <span className="font-semibold text-text-primary truncate text-sm">
          {repo.fullName}
        </span>
        <RepoMentionBadges repo={repo} size="sm" includeLongTail />
        <NpmBadge packages={getNpmPackagesForRepo(repo.fullName)} size="sm" />
        <div className="ml-auto shrink-0">
          <CategoryPill categoryId={repo.categoryId} size="sm" />
        </div>
      </div>

      {/* Row 2: Description */}
      <p className="mt-1.5 text-sm text-text-secondary truncate leading-snug">
        {repo.description}
      </p>

      {/* Row 3: Stars | Delta | Sparkline | Momentum */}
      <div className="mt-2.5 flex items-center gap-3">
        <span className="inline-flex items-center gap-1 font-mono text-xs text-text-secondary shrink-0">
          <Star size={12} className="text-[var(--v4-amber)]" />
          {formatNumber(repo.stars)}
        </span>

        <DeltaBadge value={deltaPercent} size="sm" />

        <Sparkline
          data={repo.sparklineData}
          width={72}
          height={20}
          positive={repo.starsDelta7d >= 0}
          className="shrink-0"
        />

        <div className="ml-auto shrink-0">
          <MomentumBadge score={repo.momentumScore} size="sm" />
        </div>
      </div>
    </Link>
  );
}
