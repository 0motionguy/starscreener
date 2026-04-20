import Link from "next/link";
import type { CSSProperties } from "react";

import {
  buildMindshareGroups,
  layoutTreemap,
  type MindshareGroup,
  type MindshareRepo,
  type TreemapRect,
} from "@/lib/mindshare-map";
import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 372;
const TILE_GAP = 3;

interface WeightedGroup extends MindshareGroup {
  value: number;
}

interface WeightedRepo extends MindshareRepo {
  value: number;
}

interface MindshareMapProps {
  repos: Repo[];
}

function absoluteStyle(
  rect: Pick<TreemapRect<unknown>, "x" | "y" | "width" | "height">,
  parentWidth: number,
  parentHeight: number,
  gap = 0,
): CSSProperties {
  const x = rect.x + gap;
  const y = rect.y + gap;
  const width = Math.max(0, rect.width - gap * 2);
  const height = Math.max(0, rect.height - gap * 2);

  return {
    left: `${(x / parentWidth) * 100}%`,
    top: `${(y / parentHeight) * 100}%`,
    width: `${(width / parentWidth) * 100}%`,
    height: `${(height / parentHeight) * 100}%`,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shortRepoName(repo: MindshareRepo): string {
  if (repo.name.length <= 18) return repo.name;
  return `${repo.name.slice(0, 16)}...`;
}

function RepoTile({
  rect,
  group,
  parentWidth,
  parentHeight,
}: {
  rect: TreemapRect<WeightedRepo>;
  group: MindshareGroup;
  parentWidth: number;
  parentHeight: number;
}) {
  const repo = rect.item;
  const showText = rect.width >= 88 && rect.height >= 28;
  const showDelta = rect.width >= 126 && rect.height >= 38;
  const showAvatar = rect.width >= 96 && rect.height >= 34;

  return (
    <Link
      href={repo.href}
      title={`${repo.fullName}: +${formatNumber(repo.value24h)} stars in 24h`}
      className={cn(
        "absolute overflow-hidden rounded-sm border",
        "border-black/20 bg-black/18",
        "transition-[background-color,border-color] duration-150",
        "hover:z-20 hover:border-white/50 hover:bg-black/32",
        "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
      )}
      style={{
        ...absoluteStyle(rect, parentWidth, parentHeight, TILE_GAP),
        boxShadow: `inset 0 0 0 1px ${rgba(group.color, 0.16)}`,
      }}
    >
      {showText ? (
        <span className="flex h-full min-w-0 items-start justify-between gap-1 px-1.5 py-1 text-white">
          <span className="flex min-w-0 items-center gap-1.5">
            {showAvatar ? (
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-[3px] bg-bg-inset bg-cover bg-center"
                style={{
                  backgroundImage: repo.ownerAvatarUrl
                    ? `url("${repo.ownerAvatarUrl}")`
                    : undefined,
                }}
              />
            ) : null}
            <span className="min-w-0 truncate font-mono text-[11px] leading-none">
              {shortRepoName(repo)}
            </span>
          </span>
          {showDelta ? (
            <span className="shrink-0 font-mono text-[10px] leading-none text-white/80">
              +{formatNumber(repo.value24h)}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}

function GroupTile({ rect }: { rect: TreemapRect<WeightedGroup> }) {
  const group = rect.item;
  const showHeader = rect.width >= 70 && rect.height >= 42;
  const showShare = rect.width >= 126 && rect.height >= 54;
  const showRepos = rect.width >= 132 && rect.height >= 92;
  const headerHeight = showHeader ? 36 : 0;
  const childWidth = Math.max(1, rect.width - 8);
  const childHeight = Math.max(1, rect.height - headerHeight - 10);
  const childRects = showRepos
    ? layoutTreemap<WeightedRepo>(
        group.repos.map((repo) => ({ ...repo, value: repo.value24h })),
        childWidth,
        childHeight,
      )
    : [];

  return (
    <div
      className="absolute overflow-hidden rounded-[6px] border border-black/35"
      style={{
        ...absoluteStyle(rect, MAP_WIDTH, MAP_HEIGHT, TILE_GAP),
        background: `linear-gradient(135deg, ${rgba(group.color, 0.9)}, ${rgba(
          group.color,
          0.64,
        )})`,
      }}
    >
      {showHeader ? (
        <div className="absolute left-2 right-2 top-2 z-10 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold leading-none text-white drop-shadow-sm md:text-base">
              {group.label}
            </div>
            {showShare ? (
              <div className="mt-1 font-mono text-[10px] leading-none text-white/78">
                {group.sharePct}% / +{formatNumber(group.total24h)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showRepos ? (
        <div
          className="absolute left-1 right-1 bottom-1"
          style={{ top: headerHeight + 4 }}
        >
          {childRects.map((child) => (
            <RepoTile
              key={child.item.id}
              group={group}
              rect={child}
              parentWidth={childWidth}
              parentHeight={childHeight}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MindshareMap({ repos }: MindshareMapProps) {
  const groups = buildMindshareGroups(repos, {
    includeCategoryFallback: false,
    maxGroups: 16,
    reposPerGroup: 7,
  });

  if (groups.length === 0) return null;

  const total24h = groups.reduce((sum, group) => sum + group.total24h, 0);
  const mappedRepos = groups.reduce((sum, group) => sum + group.repos.length, 0);
  const groupRects = layoutTreemap<WeightedGroup>(
    groups.map((group) => ({ ...group, value: group.total24h })),
    MAP_WIDTH,
    MAP_HEIGHT,
  );

  return (
    <section className="px-4 pt-4 sm:px-6">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase text-brand">
            OSSInsights Mindshare
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-text-primary md:text-3xl">
            Trending market map
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-secondary">
          <span className="rounded-sm border border-border-primary bg-bg-secondary px-2 py-1">
            +{formatNumber(total24h)} stars / 24h
          </span>
          <span className="rounded-sm border border-border-primary bg-bg-secondary px-2 py-1">
            {groups.length} clusters
          </span>
          <span className="rounded-sm border border-border-primary bg-bg-secondary px-2 py-1">
            {mappedRepos} mapped repos
          </span>
        </div>
      </div>

      <div className="relative h-[320px] overflow-hidden rounded-card border border-border-primary bg-bg-inset shadow-card md:h-[380px]">
        {groupRects.map((groupRect) => (
          <GroupTile key={groupRect.item.id} rect={groupRect} />
        ))}
      </div>
    </section>
  );
}
