"use client";

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

  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";

  // <button> not <a> — badges render inside parent <Link> rows in the
  // terminal grid; nested <a> is invalid and breaks Next hydration.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.count7d} Lobsters mentions, top story ${mention.topStory?.title ?? ""}`}
      className={`inline-flex items-center gap-1 rounded-md text-[10px] font-mono border transition-colors cursor-pointer ${sizeClasses}`}
      style={{
        color: LOBSTERS_RED,
        borderColor: `${LOBSTERS_RED}4D`,
      }}
    >
      <span
        className="text-white text-[8px] font-bold w-3 h-3 leading-none rounded-sm flex items-center justify-center"
        style={{ backgroundColor: LOBSTERS_RED }}
      >
        L
      </span>
      {mention.count7d}
    </button>
  );
}

export default LobstersBadge;
