"use client";

import { Chip } from "@/components/ui/Badge";

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
  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";

  // High-engagement fill tier: any post with ≥50 likes OR ≥5 reposts gets
  // a subtle blue wash so the row pops on scroll. Parallels HnBadge's
  // everHitFrontPage fill tier.
  const isHighSignal =
    (mention.topPost?.likeCount ?? 0) >= 50 || mention.repostsSum7d >= 5;
  // <button> not <a> — these badges live inside parent <Link> rows
  // (CrossSignalBreakouts, RepoCard, sidebar, terminal). Nested <a> is
  // invalid HTML and breaks Next hydration.
  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.count7d} Bluesky mentions${mention.topPost ? `, top by @${mention.topPost.author.handle}` : ""}`}
      className={sizeClasses}
      style={{
        color: "var(--source-bluesky)",
        borderColor:
          "color-mix(in oklab, var(--source-bluesky) 45%, transparent)",
        background: isHighSignal
          ? "color-mix(in oklab, var(--source-bluesky) 10%, transparent)"
          : "var(--bg-050)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center bg-[var(--source-bluesky)] text-[8px] font-bold leading-none text-[var(--bg-000)]"
        aria-hidden
      >
        B
      </span>
      {mention.count7d}
    </Chip>
  );
}

export default BskyBadge;
