"use client";

// InventoryBand — visible 4-stat data inventory for source pages.
//
// User pain: "we're showing more signals as what we're showing in the data".
// This makes the breakdown explicit so the gap between collected vs rendered
// is intentional, not confusing.
//
// Render shape (mockup-canonical, 4 tiles):
//
//   ┌────────────────────────────────────────────────────────────┐
//   │ ● TWEETS OBSERVED   ● REPOS WITH BUZZ   ● FRESH NOW   ● .. │
//   │   6,247                312                 18              │
//   │   last 24h scan        ever                <24h            │
//   └────────────────────────────────────────────────────────────┘
//
// Mobile: collapses to 2x2 grid via `<md:grid-cols-2`.
// Desktop: horizontal flex strip.
//
// Tone dot color comes from existing CSS vars (--sig-green/yellow/red) via
// inline style — there is no `bg-sig-*` Tailwind utility in this project.
// Pattern matches KpiBand's `pip` prop.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type InventoryTone = "default" | "fresh" | "stale" | "dead";

export interface InventoryStat {
  /** Caps label, e.g. "Tweets observed". */
  label: string;
  /** Big number — accepts pre-formatted strings ("6,247") or raw numbers. */
  value: number | string;
  /** Muted sub-line below the value, e.g. "last 24h scan window". */
  sub?: string;
  /** Controls tone dot color. */
  tone?: InventoryTone;
  /** When set, the tile becomes a click target jumping to a section. */
  href?: string;
}

interface Props {
  source:
    | "twitter"
    | "reddit"
    | "hackernews"
    | "lobsters"
    | "devto"
    | "bluesky"
    | "producthunt"
    | string;
  /** Typically 4 stats: collected / total / fresh / stale. */
  stats: InventoryStat[];
  className?: string;
}

const TONE_COLOR: Record<InventoryTone, string> = {
  default: "var(--color-text-tertiary)",
  fresh: "var(--sig-green)",
  stale: "var(--sig-yellow, var(--sig-amber))",
  dead: "var(--sig-red)",
};

function formatValue(value: number | string): string {
  if (typeof value === "string") return value;
  // Use locale grouping for big numbers so "6247" renders "6,247".
  return value.toLocaleString("en-US");
}

interface TileInnerProps {
  stat: InventoryStat;
  source: string;
}

function TileInner({ stat, source }: TileInnerProps): ReactNode {
  const tone = stat.tone ?? "default";
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: TONE_COLOR[tone] }}
          data-source={source}
        />
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
          {stat.label}
        </span>
      </div>
      <div className="font-display text-2xl font-bold leading-none text-text-primary">
        {formatValue(stat.value)}
      </div>
      {stat.sub ? (
        <div className="text-[11px] text-text-secondary">{stat.sub}</div>
      ) : null}
    </>
  );
}

export function InventoryBand({
  source,
  stats,
  className,
}: Props): ReactNode {
  return (
    <div
      role="group"
      aria-label={`${source} data inventory`}
      data-source={source}
      className={cn(
        // Container
        "mb-4 rounded-card border border-border-primary bg-bg-secondary p-3",
        // Layout: 2-col grid on mobile, horizontal flex on md+
        "grid grid-cols-2 gap-4 md:flex md:flex-wrap md:gap-6",
        className,
      )}
    >
      {stats.map((stat, i) => {
        const tileClass = cn(
          "flex min-w-[120px] flex-col gap-1",
          stat.href &&
            "-m-1 rounded-card p-1 transition-colors hover:bg-bg-tertiary",
        );

        if (stat.href) {
          return (
            <a key={`${stat.label}-${i}`} href={stat.href} className={tileClass}>
              <TileInner stat={stat} source={source} />
            </a>
          );
        }
        return (
          <div key={`${stat.label}-${i}`} className={tileClass}>
            <TileInner stat={stat} source={source} />
          </div>
        );
      })}
    </div>
  );
}

// ---- Default-stats helpers ---------------------------------------------------

export function buildTwitterInventoryStats(opts: {
  totalMentions24h: number;
  reposEverSeen: number;
  freshNow: number;
  staleCount: number;
}): InventoryStat[] {
  return [
    {
      label: "Tweets observed",
      value: opts.totalMentions24h,
      sub: "last 24h",
      tone: "default",
    },
    {
      label: "Repos with buzz",
      value: opts.reposEverSeen,
      sub: "ever",
      tone: "default",
    },
    {
      label: "Fresh now",
      value: opts.freshNow,
      sub: "<24h",
      tone: "fresh",
    },
    {
      label: "Stale",
      value: opts.staleCount,
      sub: "24h-7d",
      tone: "stale",
      href: "#stale-section",
    },
  ];
}

export function buildRedditInventoryStats(opts: {
  postsCollected: number;
  subredditsScanned: number;
  postsWithEngagement: number;
  postsZeroEngagement: number;
}): InventoryStat[] {
  return [
    {
      label: "Posts collected",
      value: opts.postsCollected,
      sub: "last scrape",
      tone: "default",
    },
    {
      label: "Subs scanned",
      value: opts.subredditsScanned,
      tone: "default",
    },
    {
      label: "With engagement",
      value: opts.postsWithEngagement,
      sub: "score>0 or comments>0",
      tone: "fresh",
    },
    {
      label: "Zero-engagement",
      value: opts.postsZeroEngagement,
      sub: "RSS-fallback artifacts",
      tone: "stale",
      href: "#zero-engagement-section",
    },
  ];
}
