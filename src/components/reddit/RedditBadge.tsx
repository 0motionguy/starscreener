"use client";

import type { Repo } from "@/lib/types";

interface RedditBadgeProps {
  mention: Repo["reddit"];
  size?: "sm" | "md";
}

const REDDIT_ORANGE = "#ff4500";

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
  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";
  const isHighSignal = mention.mentions7d >= 3 || mention.upvotes7d >= 100;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.mentions7d} Reddit mentions`}
      className={`inline-flex items-center gap-1 rounded-md border font-mono text-[10px] transition-colors cursor-pointer ${sizeClasses} ${
        isHighSignal ? "bg-[#ff4500]/10" : ""
      }`}
      style={{ color: REDDIT_ORANGE, borderColor: `${REDDIT_ORANGE}4D` }}
    >
      <span
        className="flex h-3 w-3 items-center justify-center rounded-sm text-[8px] font-bold leading-none text-white"
        style={{ backgroundColor: REDDIT_ORANGE }}
        aria-hidden
      >
        R
      </span>
      {mention.mentions7d}
    </button>
  );
}

export default RedditBadge;
