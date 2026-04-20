"use client";

import Link from "next/link";
import { GitFork, Users } from "lucide-react";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { Sparkline } from "@/components/shared/Sparkline";
import { cn, formatNumber } from "@/lib/utils";
import type { FeaturedCard as FeaturedCardType } from "@/lib/types";

interface FeaturedCardProps {
  card: FeaturedCardType;
  /** Zero-based index used to stagger the slide-up animation. */
  index?: number;
}

/**
 * Featured trending card — data-dense trader-style layout.
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │ #1 TODAY                          [AI/ML]       │  label + category
 *   │ vercel/next.js                                  │  fullName (prominent)
 *   │ ┌──────────┐  +780 ★          ╱╲                │  stars gain hero
 *   │ │          │  +2.3%                ╱╱╲          │  sparkline right
 *   │ │ 135k ★   │                                    │
 *   │ └──────────┘                                    │
 *   │ 🍴 13.5k   👥 249   · v15 release + HN front   │  forks/contrib/reason
 *   └─────────────────────────────────────────────────┘
 */
export function FeaturedCard({ card, index = 0 }: FeaturedCardProps) {
  const { repo } = card;
  const gain = repo.starsDelta24h;
  const pct = repo.stars > 0 ? (gain / repo.stars) * 100 : 0;
  const isPositive = gain >= 0;
  const gainSign = gain > 0 ? "+" : gain < 0 ? "" : "";
  const pctSign = pct > 0 ? "+" : pct < 0 ? "" : "";

  return (
    <Link
      href={`/repo/${repo.owner}/${repo.name}`}
      className={cn(
        "group relative flex flex-col flex-shrink-0 min-w-[220px] sm:w-[252px] h-[156px]",
        "bg-gradient-to-br from-bg-card via-bg-card to-bg-secondary",
        "border border-border-primary rounded-xl p-3",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] grain",
        "hover:border-brand/60 hover:shadow-[0_0_28px_-4px_var(--color-brand-glow),inset_0_1px_0_rgba(255,255,255,0.06)]",
        "hover:-translate-y-0.5 transition-all duration-200",
        "overflow-hidden",
        "animate-slide-up",
      )}
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: "both",
      }}
    >
      {/* Row 1: brand label + category pill */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.08em] text-brand">
          {card.labelDisplay}
        </span>
        <CategoryPill
          categoryId={repo.categoryId}
          size="sm"
          variant="brand"
        />
      </div>

      {/* Row 2: repo name — prominent */}
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        <img
          src={repo.ownerAvatarUrl}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          className="size-[18px] shrink-0 rounded-full border border-border-primary bg-bg-tertiary"
        />
        <span className="truncate font-semibold text-[13px] text-text-primary">
          {repo.fullName}
        </span>
      </div>

      {/* Row 3: big stars-gain + period activity left, sparkline right */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span
            className={cn(
              "text-xl font-mono font-bold leading-none tabular-nums",
              isPositive ? "text-up" : "text-down",
            )}
          >
            {gainSign}
            {formatNumber(gain)} ★
          </span>
          <span
            className={cn(
              "mt-1 text-[10px] font-mono tabular-nums",
              isPositive ? "text-up" : "text-down",
              "opacity-80",
            )}
          >
            {pctSign}
            {pct.toFixed(1)}%
            <span className="ml-1.5 text-text-tertiary">
              · {formatNumber(repo.stars)}
            </span>
          </span>
        </div>
        <Sparkline
          data={repo.sparklineData}
          width={64}
          height={32}
          positive={isPositive}
          className="shrink-0 self-center"
        />
      </div>

      {/* Row 4: forks + contributors + reason (line-clamp) */}
      <div className="mt-auto flex items-center gap-2 text-[10px] font-mono text-text-tertiary">
        <span className="inline-flex items-center gap-1 shrink-0">
          <GitFork size={10} aria-hidden="true" />
          <span className="tabular-nums">{formatNumber(repo.forks)}</span>
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <Users size={10} aria-hidden="true" />
          <span className="tabular-nums">{formatNumber(repo.contributors)}</span>
        </span>
        <span className="truncate text-text-secondary">
          · {card.reason}
        </span>
      </div>

      {/* NUMBER_ONE_TODAY: hover pulse overlay */}
      {card.label === "NUMBER_ONE_TODAY" && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 group-hover:animate-brand-pulse"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
