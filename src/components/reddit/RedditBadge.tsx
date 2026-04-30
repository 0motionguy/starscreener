"use client";

import { Chip } from "@/components/ui/Badge";
import type { Repo } from "@/lib/types";

interface RedditBadgeProps {
  mention: Repo["reddit"];
  size?: "sm" | "md";
}

function redditHref(post: NonNullable<NonNullable<Repo["reddit"]>["topPost"]>): string {
  if (post.permalink.startsWith("http")) return post.permalink;
  return `https://www.reddit.com${post.permalink}`;
}

function buildTooltip(mention: NonNullable<Repo["reddit"]>): string {
  const base = `${mention.mentions7d} Reddit mentions · ${mention.upvotes7d} upvotes · ${mention.comments7d} comments`;
  if (!mention.topPost) return base;
  const title =
    mention.topPost.title.length > 70
      ? `${mention.topPost.title.slice(0, 70)}...`
      : mention.topPost.title;
  return `${base} · top r/${mention.topPost.subreddit}: "${title}"`;
}

export function RedditBadge({ mention, size = "sm" }: RedditBadgeProps) {
  if (!mention || mention.mentions7d <= 0) return null;

  const href = mention.topPost ? redditHref(mention.topPost) : "https://www.reddit.com";
  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";
  const isHighSignal = mention.mentions7d >= 3 || mention.upvotes7d >= 100;

  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.mentions7d} Reddit mentions`}
      className={sizeClasses}
      style={{
        color: "var(--source-reddit)",
        borderColor:
          "color-mix(in oklab, var(--source-reddit) 45%, transparent)",
        background: isHighSignal
          ? "color-mix(in oklab, var(--source-reddit) 10%, transparent)"
          : "var(--bg-050)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center bg-[var(--source-reddit)] text-[8px] font-bold leading-none text-[var(--bg-000)]"
        aria-hidden
      >
        R
      </span>
      {mention.mentions7d}
    </Chip>
  );
}

export default RedditBadge;
