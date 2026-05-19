"use client";

import { Chip } from "@/components/ui/Badge";

// Small inline Lobsters badge for repo rows. Mirrors HnBadge shape so
// the terminal row renders a uniform chip pattern across sources.
// Renders null when mention is missing or count7d === 0 so quiet repos
// don't show empty chips.

type LobstersTopStory = {
  shortId: string;
  title: string;
  score: number;
  url: string;
  commentsUrl: string;
  hoursSincePosted: number;
};

type LobstersMentionForBadge = {
  count7d: number;
  scoreSum7d: number;
  topStory: LobstersTopStory | null;
};

interface LobstersBadgeProps {
  mention: LobstersMentionForBadge | null;
  size?: "sm" | "md";
}

// Canonical Lobsters red. Slightly darker than the Reddit orange so the
// two signals don't blur together at chip scale.
const LOBSTERS_RED = "#ac130d";

function buildTooltip(m: LobstersMentionForBadge): string {
  if (!m.topStory) {
    return `${m.count7d} Lobsters mentions · ${m.scoreSum7d} pts`;
  }
  const ago =
    m.topStory.hoursSincePosted < 1
      ? "just now"
      : m.topStory.hoursSincePosted < 24
        ? `${Math.round(m.topStory.hoursSincePosted)}h ago`
        : `${Math.round(m.topStory.hoursSincePosted / 24)}d ago`;
  return `${m.count7d} Lobsters mentions · ${m.scoreSum7d} pts · top: "${m.topStory.title}" (${m.topStory.score}, ${ago})`;
}

export function LobstersBadge({ mention, size = "sm" }: LobstersBadgeProps) {
  if (!mention || mention.count7d === 0) return null;

  const href = mention.topStory
    ? mention.topStory.commentsUrl
    : "https://lobste.rs/";

  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";

  // <button> not <a> — badges render inside parent <Link> rows in the
  // terminal grid; nested <a> is invalid and breaks Next hydration.
  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.count7d} Lobsters mentions, top story ${mention.topStory?.title ?? ""}`}
      className={sizeClasses}
      style={{
        color: LOBSTERS_RED,
        borderColor: "rgba(255, 77, 77, 0.4)",
        background: "var(--bg-050)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center text-[8px] font-bold leading-none text-white"
        style={{ backgroundColor: LOBSTERS_RED }}
      >
        L
      </span>
      {mention.count7d}
    </Chip>
  );
}

export default LobstersBadge;
