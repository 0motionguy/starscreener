"use client";

// Small inline Bluesky badge for repo rows. Mirrors HnBadge structure —
// self-contained prop types so surface components can import without
// forcing the loader into their bundle when the badge is hidden.

type BskyTopPost = {
  uri: string;
  bskyUrl: string;
  text: string;
  author: { handle: string; displayName?: string };
  likeCount: number;
  repostCount: number;
  replyCount: number;
  hoursSincePosted: number;
};

type BskyMentionForBadge = {
  count7d: number;
  likesSum7d: number;
  repostsSum7d: number;
  topPost: BskyTopPost | null;
};

interface BskyBadgeProps {
  mention: BskyMentionForBadge | null;
  size?: "sm" | "md";
}

// Bluesky brand sky blue. Matches the "B butterfly" in-app mark closely
// enough at small sizes that a plain "B" monogram reads as Bluesky.
const BSKY_BLUE = "#0085FF";

function buildTooltip(m: BskyMentionForBadge): string {
  const base = `${m.count7d} Bluesky mention${m.count7d === 1 ? "" : "s"} · ${m.likesSum7d} likes`;
  if (!m.topPost) return base;
  const ago =
    m.topPost.hoursSincePosted < 1
      ? "just now"
      : m.topPost.hoursSincePosted < 24
        ? `${Math.round(m.topPost.hoursSincePosted)}h ago`
        : `${Math.round(m.topPost.hoursSincePosted / 24)}d ago`;
  const snippet = m.topPost.text.length > 80
    ? `${m.topPost.text.slice(0, 80)}…`
    : m.topPost.text;
  return `${base} · top by @${m.topPost.author.handle}: "${snippet}" (${m.topPost.likeCount}♥, ${ago})`;
}

export function BskyBadge({ mention, size = "sm" }: BskyBadgeProps) {
  if (!mention || mention.count7d === 0) return null;

  const href = mention.topPost?.bskyUrl ?? "https://bsky.app";
  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";

  // High-engagement fill tier: any post with ≥50 likes OR ≥5 reposts gets
  // a subtle blue wash so the row pops on scroll. Parallels HnBadge's
  // everHitFrontPage fill tier.
  const isHighSignal =
    (mention.topPost?.likeCount ?? 0) >= 50 || mention.repostsSum7d >= 5;
  const fillClass = isHighSignal ? "bg-[#0085FF]/10" : "";

  // <button> not <a> — these badges live inside parent <Link> rows
  // (CrossSignalBreakouts, RepoCard, sidebar, terminal). Nested <a> is
  // invalid HTML and breaks Next hydration.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.count7d} Bluesky mentions${mention.topPost ? `, top by @${mention.topPost.author.handle}` : ""}`}
      className={`inline-flex items-center gap-1 rounded-md text-[10px] font-mono border transition-colors cursor-pointer ${sizeClasses} ${fillClass}`}
      style={{
        color: BSKY_BLUE,
        borderColor: `${BSKY_BLUE}4D`,
      }}
    >
      <span
        className="text-white text-[8px] font-bold w-3 h-3 leading-none rounded-sm flex items-center justify-center"
        style={{ backgroundColor: BSKY_BLUE }}
        aria-hidden
      >
        B
      </span>
      {mention.count7d}
    </button>
  );
}

export default BskyBadge;
