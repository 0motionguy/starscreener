"use client";

// Small inline HN badge for repo rows. Self-contained: defines its own prop
// types so it can ship before src/lib/hackernews.ts lands. The orchestrator
// will wire it into terminal/sidebar/compare/feed afterward.

type HnTopStory = {
  id: number;
  title: string;
  score: number;
  url: string;
  hoursSincePosted: number;
};

type HnMentionForBadge = {
  count7d: number;
  scoreSum7d: number;
  everHitFrontPage: boolean;
  topStory: HnTopStory | null;
};

interface HnBadgeProps {
  mention: HnMentionForBadge | null;
  size?: "sm" | "md";
}

function buildTooltip(m: HnMentionForBadge): string {
  if (!m.topStory) {
    return `${m.count7d} HN mentions · ${m.scoreSum7d} pts`;
  }
  const ago =
    m.topStory.hoursSincePosted < 1
      ? "just now"
      : m.topStory.hoursSincePosted < 24
        ? `${Math.round(m.topStory.hoursSincePosted)}h ago`
        : `${Math.round(m.topStory.hoursSincePosted / 24)}d ago`;
  return `${m.count7d} HN mentions · ${m.scoreSum7d} pts · top: "${m.topStory.title}" (${m.topStory.score}, ${ago})`;
}

export function HnBadge({ mention, size = "sm" }: HnBadgeProps) {
  if (!mention || mention.count7d === 0) return null;

  const href = mention.topStory
    ? `https://news.ycombinator.com/item?id=${mention.topStory.id}`
    : "https://news.ycombinator.com";

  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";
  const fillClass = mention.everHitFrontPage ? "bg-[#ff6600]/10" : "";

  // <button> not <a> — these badges live inside parent <Link> rows
  // (CrossSignalBreakouts, RepoCard, sidebar watchlist, terminal repo cell).
  // Nested <a> is invalid HTML and breaks Next hydration. Click handler
  // stops propagation + opens HN in a new tab via window.open.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.count7d} HackerNews mentions, top story ${mention.topStory?.title ?? ""}`}
      className={`inline-flex items-center gap-1 rounded-md text-[10px] font-mono text-[#ff6600] border border-[#ff6600]/30 hover:border-[#ff6600]/60 transition-colors cursor-pointer ${sizeClasses} ${fillClass}`}
    >
      <span className="bg-[#ff6600] text-white text-[8px] font-bold w-3 h-3 leading-none rounded-sm flex items-center justify-center">
        Y
      </span>
      {mention.count7d}
    </button>
  );
}

export default HnBadge;
