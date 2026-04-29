"use client";

import Link from "next/link";
import { GitFork, Users } from "lucide-react";
import { Sparkline } from "@/components/shared/Sparkline";
import { cn, formatNumber } from "@/lib/utils";
import type { FeaturedCard as FeaturedCardType } from "@/lib/types";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";

interface FeaturedCardProps {
  card: FeaturedCardType;
  /** Zero-based index used to stagger the slide-up animation. */
  index?: number;
}

/**
 * Featured trending card — V2 design system.
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │ ◦ ◦ ◦  // REPO · OWNER/NAME          12.5K ★    │  v2-term-bar
 *   ├─────────────────────────────────────────────────┤
 *   │ [██]  vercel/next.js                            │  avatar 24px sq + repo name
 *   │       reason text, line clamp                   │
 *   │                                                 │
 *   │ +780  +2.3%                            ╱╲       │  delta + sparkline
 *   │                                                 │
 *   │ [#1 TODAY]  [BRK]  fork 13.5k · 249 ctrb        │  tags + meta
 *   └─────────────────────────────────────────────────┘
 *
 * Top-rank (NUMBER_ONE_TODAY) gets v2-bracket corner markers — the day's
 * strongest signal declares itself as the focused object.
 */
export function FeaturedCard({ card, index = 0 }: FeaturedCardProps) {
  const { repo } = card;
  const gain = repo.starsDelta24h;
  const pct = repo.stars > 0 ? (gain / repo.stars) * 100 : 0;
  const isPositive = gain >= 0;
  const gainSign = gain > 0 ? "+" : gain < 0 ? "" : "";
  const pctSign = pct > 0 ? "+" : pct < 0 ? "" : "";
  const isTopRank = card.label === "NUMBER_ONE_TODAY";

  // Shorten owner/name for the terminal-bar header without truncating mid-glyph.
  const headerSlug = `${repo.owner}/${repo.name}`.toUpperCase();

  // Map gain direction to V2 signal tokens — green up, red down, dim neutral.
  const deltaColor = isPositive
    ? "var(--v2-sig-green)"
    : "var(--v2-sig-red)";

  return (
    <Link
      href={`/repo/${repo.owner}/${repo.name}`}
      className={cn(
        "v2-card group relative flex flex-col flex-shrink-0",
        "min-w-[260px] sm:w-[296px] h-[176px]",
        "overflow-hidden",
        "transition-[border-color,background-color] duration-200",
        "hover:border-[color:var(--v2-line-300)]",
        isTopRank && "v2-bracket",
        "animate-slide-up",
      )}
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: "both",
      }}
    >
      {/* Terminal-bar header: // REPO · OWNER/NAME · stars right */}
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span
            className={cn(
              "block h-1.5 w-1.5 rounded-full",
              isTopRank && "v2-live-dot",
            )}
            style={
              isTopRank ? undefined : { background: "var(--v2-line-300)" }
            }
          />
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
          <span aria-hidden style={{ color: "var(--v2-ink-400)" }}>
            {"// "}
          </span>
          REPO
          <span aria-hidden className="mx-1.5" style={{ color: "var(--v2-ink-500)" }}>
            ·
          </span>
          <span style={{ color: "var(--v2-ink-100)" }}>{headerSlug}</span>
        </span>
        <span
          className="v2-stat shrink-0 tabular-nums"
          style={{ color: "var(--v2-ink-300)" }}
        >
          {formatNumber(repo.stars)} ★
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3 min-w-0">
        {/* Row 1: avatar + repo name + reason */}
        <div className="flex items-start gap-2.5 min-w-0">
          <EntityLogo
            src={repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 24)}
            name={repo.fullName}
            size={24}
            shape="square"
            alt=""
          />
          <div className="flex-1 min-w-0">
            <div
              className="truncate transition-colors duration-200 group-hover:text-[color:var(--v2-acc)]"
              style={{
                fontFamily: "var(--font-geist), Inter, sans-serif",
                fontWeight: 510,
                fontSize: 16,
                lineHeight: 1.2,
                letterSpacing: "-0.012em",
                color: "var(--v2-ink-100)",
              }}
            >
              {repo.fullName}
            </div>
            <div
              className="mt-0.5 truncate text-[11px] leading-snug"
              style={{ color: "var(--v2-ink-300)" }}
            >
              {card.reason}
            </div>
          </div>
        </div>

        {/* Row 2: delta + sparkline */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="v2-stat tabular-nums text-[15px] leading-none"
              style={{ color: deltaColor }}
            >
              {gainSign}
              {formatNumber(gain)} ★
            </span>
            <span
              className="v2-stat tabular-nums text-[11px] leading-none opacity-90"
              style={{ color: deltaColor }}
            >
              {pctSign}
              {pct.toFixed(1)}%
            </span>
            <span
              aria-hidden
              className="v2-mono text-[10px]"
              style={{ color: "var(--v2-ink-500)" }}
            >
              /24H
            </span>
          </div>
          <Sparkline
            data={repo.sparklineData}
            width={64}
            height={26}
            positive={isPositive}
            className="shrink-0 self-center opacity-80"
          />
        </div>

        {/* Row 3: tags + meta */}
        <div className="mt-auto flex items-center gap-1.5 min-w-0">
          <span
            className="v2-tag shrink-0"
            style={{
              color: "var(--v2-acc)",
              borderColor: "var(--v2-line-300)",
            }}
          >
            {card.labelDisplay}
          </span>
          {isTopRank ? null : (
            <span className="v2-tag shrink-0">BRK</span>
          )}
          <span
            className="ml-auto inline-flex items-center gap-2 text-[10px] shrink-0"
            style={{
              fontFamily:
                "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
              letterSpacing: "0.08em",
              color: "var(--v2-ink-300)",
            }}
          >
            <span className="inline-flex items-center gap-1">
              <GitFork size={10} aria-hidden />
              <span className="tabular-nums">{formatNumber(repo.forks)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={10} aria-hidden />
              <span className="tabular-nums">
                {formatNumber(repo.contributors)}
              </span>
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
