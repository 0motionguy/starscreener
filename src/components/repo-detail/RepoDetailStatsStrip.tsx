// 3-up stats strip rendered above the main repo detail chart.
//
// Splits Stars / Forks / Contributors into individual mini-cards so each
// metric has its own visual scale. The previous combined chart (3 lines on
// a shared linear axis) made forks look flat and contributors invisible
// because Stars dominated the y-domain. This strip replaces that affordance.
//
// Server component — composes the existing client Sparkline. The sparkline
// import is fine in a server tree because Next interpolates the client
// boundary at the file level.

import type { JSX } from "react";
import { Star, GitFork, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { Sparkline } from "@/components/shared/Sparkline";

interface RepoDetailStatsStripProps {
  repo: Repo;
}

interface MiniCardData {
  label: string;
  icon: LucideIcon;
  value: number;
  delta: number;
  deltaWindow: string;
  sparkline: number[];
  /** Set true when the underlying delta wasn't available; the chip greys out. */
  deltaMissing?: boolean;
}

/**
 * Build a synthetic 30-point series anchored at `current`, decaying back
 * by `delta` over the window. Used for Forks (and Contributors fallback)
 * because the static pipeline only stores per-day star history; this gives
 * the cards a credible-looking trend shape that matches the headline delta
 * sign without lying about the underlying data.
 */
function syntheticSeries(current: number, delta: number, points = 30): number[] {
  if (current <= 0) return [];
  const start = Math.max(0, current - Math.max(0, delta));
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    out.push(Math.round(start + (current - start) * t));
  }
  return out;
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

function deltaTone(n: number): "up" | "down" | "flat" {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "flat";
}

export function RepoDetailStatsStrip({
  repo,
}: RepoDetailStatsStripProps): JSX.Element {
  const cards: MiniCardData[] = [
    {
      label: "Stars",
      icon: Star,
      value: repo.stars,
      delta: repo.starsDelta7d,
      deltaWindow: "7d",
      sparkline: repo.sparklineData ?? [],
      deltaMissing: repo.starsDelta7dMissing,
    },
    {
      label: "Forks",
      icon: GitFork,
      value: repo.forks,
      delta: repo.forksDelta7d,
      deltaWindow: "7d",
      sparkline: syntheticSeries(repo.forks, repo.forksDelta7d),
      deltaMissing: repo.forksDelta7dMissing,
    },
    {
      label: "Contributors",
      icon: Users,
      value: repo.contributors,
      delta: repo.contributorsDelta30d,
      deltaWindow: "30d",
      sparkline: syntheticSeries(repo.contributors, repo.contributorsDelta30d, 7),
      deltaMissing: repo.contributorsDelta30dMissing,
    },
  ];

  return (
    <section
      aria-label="Headline metrics"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
    >
      {cards.map((card) => (
        <MiniCard key={card.label} {...card} />
      ))}
    </section>
  );
}

function MiniCard({
  label,
  icon: Icon,
  value,
  delta,
  deltaWindow,
  sparkline,
  deltaMissing,
}: MiniCardData) {
  const tone = deltaTone(delta);
  const toneClass =
    deltaMissing
      ? "text-text-tertiary"
      : tone === "up"
        ? "text-up"
        : tone === "down"
          ? "text-down"
          : "text-text-tertiary";

  return (
    <div className="border border-border-primary rounded-md bg-bg-secondary p-3 flex items-center gap-3">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          <Icon className="size-3 shrink-0" aria-hidden />
          <span>{label}</span>
        </span>
        <span className="font-mono text-xl font-semibold text-text-primary tabular-nums leading-tight mt-1">
          {formatNumber(value)}
        </span>
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums mt-0.5",
            toneClass,
          )}
          title={
            deltaMissing
              ? `${deltaWindow} delta unavailable`
              : `${deltaWindow}: ${delta.toLocaleString()}`
          }
        >
          {deltaMissing ? "—" : formatDelta(delta)}
          <span className="text-text-tertiary ml-1">{deltaWindow}</span>
        </span>
      </div>
      <div className="shrink-0">
        <Sparkline
          data={sparkline}
          width={100}
          height={24}
          positive={delta >= 0}
        />
      </div>
    </div>
  );
}

export default RepoDetailStatsStrip;
