"use client";

import { Chip } from "@/components/ui/Badge";

type PhLaunchForBadge = {
  id: string;
  name: string;
  votesCount: number;
  daysSinceLaunch: number;
  url: string;
};

interface PhBadgeProps {
  launch: PhLaunchForBadge | null;
  size?: "sm" | "md";
}

function formatAge(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function buildTooltip(l: PhLaunchForBadge): string {
  return `Launched on ProductHunt - ${l.votesCount} vote${l.votesCount === 1 ? "" : "s"} - ${formatAge(l.daysSinceLaunch)} - "${l.name}"`;
}

export function PhBadge({ launch, size = "sm" }: PhBadgeProps) {
  if (!launch) return null;

  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";
  const isHighSignal = launch.votesCount >= 200;

  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(launch.url, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(launch)}
      aria-label={`Launched on ProductHunt - ${launch.votesCount} votes, ${formatAge(launch.daysSinceLaunch)}`}
      className={sizeClasses}
      style={{
        color: "var(--source-producthunt)",
        borderColor:
          "color-mix(in oklab, var(--source-producthunt) 45%, transparent)",
        background: isHighSignal
          ? "color-mix(in oklab, var(--source-producthunt) 10%, transparent)"
          : "var(--bg-050)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center bg-[var(--source-producthunt)] text-[8px] font-bold leading-none text-[var(--bg-000)]"
        aria-hidden
      >
        P
      </span>
      {launch.votesCount}
    </Chip>
  );
}

export default PhBadge;
