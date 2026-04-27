// V2 activity strip — 4 stage cards (Discover / Validate / Build / Track),
// each wearing a terminal-bar header. The card with the highest live
// breakout count gets bracket markers — the system points at where the
// action is right now.

import Link from "next/link";
import { ArrowRight, Eye, Activity, Hammer, Rocket } from "lucide-react";

import type { Repo } from "@/lib/types";
import type { RankedIdea } from "@/components/ideas/IdeasFeedView";
import { cn, formatNumber } from "@/lib/utils";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";

interface ActivityStripV2Props {
  repos: Repo[];
  ideas: RankedIdea[];
}

interface StageCardProps {
  num: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  headline: string;
  stat: string;
  statLabel: string;
  href: string;
  /** When true, draws bracket markers around the card. */
  active?: boolean;
}

export function ActivityStripV2({ repos, ideas }: ActivityStripV2Props) {
  const breakoutCount = repos.filter(
    (r) => r.movementStatus === "breakout" || r.movementStatus === "hot",
  ).length;

  const totalSignalsFiring = repos.reduce(
    (sum, r) => sum + (r.channelsFiring ?? 0),
    0,
  );

  const fundedCount = repos.filter(
    (r) => r.funding && (r.funding.count ?? 0) > 0,
  ).length;

  const launchReady = repos.filter(
    (r) =>
      (r.channelsFiring ?? 0) >= 2 &&
      r.lastCommitAt &&
      Date.now() - Date.parse(r.lastCommitAt) < 30 * 86_400_000,
  ).length;

  // Pick the stage with the highest "energy" right now to bracket-mark.
  // Discover wins on raw breakouts; Validate wins on signal density.
  const stageScores: Record<"01" | "02" | "03" | "04", number> = {
    "01": breakoutCount,
    "02": totalSignalsFiring / 8, // normalize for fair comparison
    "03": ideas.length,
    "04": launchReady + fundedCount,
  };
  const activeStage = (Object.entries(stageScores) as [
    "01" | "02" | "03" | "04",
    number,
  ][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const cards: StageCardProps[] = [
    {
      num: "01",
      label: "DISCOVER",
      icon: Eye,
      headline: "Catch breakouts before mainstream.",
      stat: formatNumber(breakoutCount),
      statLabel: "REPOS HOT",
      href: "#repos",
      active: activeStage === "01",
    },
    {
      num: "02",
      label: "VALIDATE",
      icon: Activity,
      headline: "Cross-reference 7 social channels.",
      stat: formatNumber(totalSignalsFiring),
      statLabel: "SIGNALS FIRING",
      href: "#signals",
      active: activeStage === "02",
    },
    {
      num: "03",
      label: "BUILD",
      icon: Hammer,
      headline: "Community + agents ship ideas.",
      stat: formatNumber(ideas.length),
      statLabel: ideas.length === 1 ? "IDEA IN MOTION" : "IDEAS IN MOTION",
      href: "#ideas",
      active: activeStage === "03",
    },
    {
      num: "04",
      label: "TRACK",
      icon: Rocket,
      headline: "Funding + revenue outcomes.",
      stat: formatNumber(launchReady + fundedCount),
      statLabel: "TRACKED LAUNCHES",
      href: "#launch",
      active: activeStage === "04",
    },
  ];

  return (
    <section
      aria-label="Pipeline stages"
      className="border-b border-[color:var(--v2-line-100)]"
    >
      <div className="v2-frame py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <StageCard key={card.num} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StageCard({
  num,
  label,
  icon: Icon,
  headline,
  stat,
  statLabel,
  href,
  active,
}: StageCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "v2-card v2-card-hover overflow-hidden group",
        "flex flex-col",
        active && "v2-bracket",
      )}
    >
      {active ? <BracketMarkers /> : null}

      <TerminalBar
        label={
          <span className="flex items-center gap-2">
            <Icon className="size-3" />
            <span className="tabular-nums">{num}</span> · {label}
          </span>
        }
      />

      <div className="flex-1 p-4 flex flex-col">
        <h3
          className="text-[color:var(--v2-ink-100)]"
          style={{
            fontFamily: "var(--font-geist), Inter, sans-serif",
            fontWeight: 510,
            fontSize: 14,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          {headline}
        </h3>

        <div className="mt-auto pt-5 flex items-baseline gap-2">
          <span
            className={cn(
              "tabular-nums",
              active
                ? "text-[color:var(--v2-acc)]"
                : "text-[color:var(--v2-ink-000)]",
            )}
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontWeight: 300,
              fontSize: 32,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {stat}
          </span>
          <span className="v2-mono">{statLabel}</span>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between v2-mono">
        <span
          className={cn(
            active && "text-[color:var(--v2-acc)]",
          )}
        >
          <span aria-hidden>{"// "}</span>
          {active ? "ACTIVE" : "STAGE"}
        </span>
        <ArrowRight
          className={cn(
            "size-3 transition-transform duration-150",
            "group-hover:translate-x-0.5",
            active
              ? "text-[color:var(--v2-acc)]"
              : "text-[color:var(--v2-ink-400)]",
          )}
          aria-hidden
        />
      </div>
    </Link>
  );
}
