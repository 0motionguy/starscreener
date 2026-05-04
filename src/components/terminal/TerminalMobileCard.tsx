"use client";

// StarScreener — Terminal mobile card (<768px)
//
// Replaces the dense table row with an expandable card on small screens.
// Collapsed state (~84px) shows rank+name, description, stars/delta/
// sparkline and action icons. Tapping the chevron reveals a 2-column
// metric grid + a larger sparkline.

import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Eye,
  GitCompareArrows,
  GitFork,
  MessageCircle,
  Package,
  Users,
} from "lucide-react";

import type { Repo } from "@/lib/types";
import {
  cn,
  formatNumber,
  getRelativeTime,
} from "@/lib/utils";
import { useCompareStore, useWatchlistStore } from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";

import { BrandStar } from "@/components/shared/BrandStar";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import { RankBadge } from "@/components/shared/RankBadge";
import { Sparkline } from "@/components/shared/Sparkline";
import { RepoMentionBadges } from "@/components/repo-signals/RepoMentionBadges";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";

interface TerminalMobileCardProps {
  repo: Repo;
  displayRank: number;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function TerminalMobileCard({
  repo,
  displayRank,
  expanded,
  onToggleExpand,
}: TerminalMobileCardProps) {
  const router = useRouter();

  const isWatched = useWatchlistStore((s) =>
    s.repos.some((r) => r.repoId === repo.id),
  );
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);
  const isComparing = useCompareStore((s) => s.repos.includes(repo.id));
  const compareCount = useCompareStore((s) => s.repos.length);
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);

  const compareDisabled = !isComparing && compareCount >= 4;

  const delta7dPct =
    repo.stars > 0 ? (repo.starsDelta7d / repo.stars) * 100 : 0;
  const delta24hPct =
    repo.stars > 0 ? (repo.starsDelta24h / repo.stars) * 100 : 0;
  const delta30dPct =
    repo.stars > 0 ? (repo.starsDelta30d / repo.stars) * 100 : 0;

  const navigate = () => router.push(`/repo/${repo.owner}/${repo.name}`);

  const isBreakout = repo.movementStatus === "breakout";
  const isHot = repo.movementStatus === "hot";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate();
        }
      }}
      className={cn(
        "relative rounded-card border border-border-secondary bg-bg-card px-3 py-2.5",
        "transition-all duration-200 active:scale-[0.99]",
        isWatched && "shadow-[inset_2px_0_0_var(--color-functional)]",
        (isHot || isBreakout) &&
          "shadow-[inset_0_0_0_1px_rgba(245,110,15,0.3),0_0_16px_-4px_rgba(245,110,15,0.35)]",
      )}
    >
      {/* Row 1: rank + name (flex-wraps momentum/category under name on <380px) */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {displayRank <= 3 ? (
          <RankBadge rank={displayRank} size="sm" />
        ) : (
          <span className="font-mono text-[11px] text-text-tertiary tabular-nums">
            #{displayRank}
          </span>
        )}
        <EntityLogo
          src={repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 24)}
          name={repo.fullName}
          size={24}
          shape="square"
          alt=""
        />
        <span className="min-w-0 flex-1 basis-[60%] truncate text-[13px] font-semibold text-text-primary">
          {repo.fullName}
        </span>
        <RepoMentionBadges
          repo={repo}
          size="sm"
          includeLongTail={false}
          className="max-w-full overflow-hidden"
        />
        <div className="flex items-center gap-2 ml-auto">
          <MomentumBadge score={repo.momentumScore} size="sm" />
          <CategoryPill categoryId={repo.categoryId} size="sm" />
        </div>
      </div>

      {/* Row 2: description */}
      {repo.description ? (
        <p className="mt-1 line-clamp-1 text-[11px] text-text-tertiary">
          {repo.description}
        </p>
      ) : null}

      {/* Row 3: stars + 7d delta + sparkline + actions + expand */}
      <div className="mt-2 flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-text-secondary">
          <BrandStar size={11} className="text-[var(--v4-amber)]" />
          {formatNumber(repo.stars)}
        </span>
        <DeltaBadge value={delta7dPct} size="sm" window="7d" />
        <Sparkline
          data={repo.sparklineData}
          width={72}
          height={18}
          positive={repo.starsDelta7d >= 0}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const wasWatched = isWatched;
              toggleWatch(repo.id, repo.stars);
              if (wasWatched) toastWatchRemoved(repo.fullName);
              else toastWatchAdded(repo.fullName);
            }}
            aria-label={
              isWatched ? "Remove from watchlist" : "Add to watchlist"
            }
            aria-pressed={isWatched}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded transition-colors",
              isWatched
                ? "text-functional"
                : "text-text-tertiary hover:bg-bg-tertiary",
            )}
          >
            <Eye
              size={15}
              strokeWidth={2}
              fill={isWatched ? "currentColor" : "none"}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isComparing) {
                removeCompare(repo.id);
                toastCompareRemoved(
                  useCompareStore.getState().repos.length,
                );
                return;
              }
              if (useCompareStore.getState().isFull()) {
                toastCompareFull();
                return;
              }
              addCompare(repo.id);
              toastCompareAdded(useCompareStore.getState().repos.length);
            }}
            aria-label={
              isComparing
                ? "Remove from compare"
                : compareDisabled
                  ? "Compare is full"
                  : "Add to compare"
            }
            aria-pressed={isComparing}
            aria-disabled={compareDisabled}
            title={
              compareDisabled
                ? "Compare is full — remove one first"
                : isComparing
                  ? "Remove from compare"
                  : "Add to compare"
            }
            className={cn(
              "inline-flex size-11 items-center justify-center rounded transition-colors",
              isComparing
                ? "text-brand"
                : compareDisabled
                  ? "text-text-muted opacity-50 cursor-not-allowed"
                  : "text-text-tertiary hover:bg-bg-tertiary",
            )}
          >
            <GitCompareArrows size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={expanded ? "Collapse details" : "Expand details"}
            aria-expanded={expanded}
            className="inline-flex size-11 items-center justify-center rounded text-text-tertiary hover:bg-bg-tertiary transition-colors"
          >
            <ChevronDown
              size={15}
              strokeWidth={2}
              className={cn(
                "transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* Expanded block: bigger sparkline + 2-column metric grid */}
      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
          expanded
            ? "grid-rows-[1fr] opacity-100 mt-3"
            : "grid-rows-[0fr] opacity-0 mt-0",
        )}
        aria-hidden={!expanded}
      >
        <div className="min-h-0">
          <div className="flex items-center justify-center rounded-md border border-border-secondary bg-bg-inset px-2 py-2">
            <Sparkline
              data={repo.sparklineData}
              width={120}
              height={32}
              positive={repo.starsDelta7d >= 0}
            />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <Metric
              icon={<GitFork size={11} />}
              label="Forks"
              value={formatNumber(repo.forks)}
            />
            <Metric
              icon={<span className="label-micro">24H</span>}
              label=""
              value={<DeltaBadge value={delta24hPct} size="sm" window="24h" />}
            />
            <Metric
              icon={<Users size={11} />}
              label="Contrib"
              value={formatNumber(repo.contributors)}
            />
            <Metric
              icon={<span className="label-micro">30D</span>}
              label=""
              value={<DeltaBadge value={delta30dPct} size="sm" window="30d" />}
            />
            <Metric
              icon={<MessageCircle size={11} />}
              label="Issues"
              value={formatNumber(repo.openIssues)}
            />
            <Metric
              icon={<Package size={11} />}
              label="Release"
              value={
                repo.lastReleaseAt
                  ? getRelativeTime(repo.lastReleaseAt)
                  : "—"
              }
            />
            <Metric
              icon={<span className="label-micro">BUZZ</span>}
              label=""
              value={`${repo.socialBuzzScore} ×${repo.mentionCount24h}`}
            />
            <Metric
              icon={<span className="label-micro">COMMIT</span>}
              label=""
              value={getRelativeTime(repo.lastCommitAt)}
            />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border-secondary bg-bg-secondary px-2 py-1.5">
      <span className="inline-flex items-center gap-1 text-text-tertiary">
        {icon}
        {label ? <span className="label-micro">{label}</span> : null}
      </span>
      <span className="font-mono tabular-nums text-text-primary">{value}</span>
    </div>
  );
}
