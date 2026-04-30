"use client";

import { Chip } from "@/components/ui/Badge";

// Small inline dev.to badge for repo rows. Mirrors HnBadge / BskyBadge
// structure — self-contained prop types so surface components can import
// without forcing the loader into their bundle when the badge is hidden.
//
// Badge appears only when a repo has at least one tracked-repo article on
// dev.to in the last 7d (sparse by design — far rarer than HN mentions).

type DevtoTopArticle = {
  id: number;
  title: string;
  url: string;
  author: string;
  reactions: number;
  comments: number;
  readingTime: number;
};

type DevtoMentionForBadge = {
  mentions7d: number;
  reactions7d: number;
  comments7d: number;
  topArticle?: DevtoTopArticle;
};

interface DevtoBadgeProps {
  mention: DevtoMentionForBadge | null;
  size?: "sm" | "md";
}

// dev.to brand black. Tailwind dark: variants flip to white background
// + black text so the monogram stays legible on dark surfaces.
const DEVTO_BLACK = "#0a0a0a";

function buildTooltip(m: DevtoMentionForBadge): string {
  const tutorialNoun = m.mentions7d === 1 ? "tutorial" : "tutorials";
  const base = `${m.mentions7d} dev.to ${tutorialNoun} · ${m.reactions7d} reactions`;
  if (!m.topArticle) return base;
  const snippet =
    m.topArticle.title.length > 60
      ? `${m.topArticle.title.slice(0, 60)}…`
      : m.topArticle.title;
  return `${base} · top by @${m.topArticle.author}: "${snippet}" (${m.topArticle.reactions}♥, ${m.topArticle.readingTime} min read)`;
}

export function DevtoBadge({ mention, size = "sm" }: DevtoBadgeProps) {
  if (!mention || mention.mentions7d === 0) return null;

  const href = mention.topArticle?.url ?? "https://dev.to";
  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";

  // High-engagement fill tier: top article ≥50 reactions OR ≥3 mentions.
  // Parallels HnBadge.everHitFrontPage and BskyBadge isHighSignal tiers.
  const isHighSignal =
    (mention.topArticle?.reactions ?? 0) >= 50 || mention.mentions7d >= 3;
  // <button> not <a> — these badges live inside parent <Link> rows.
  // Nested <a> is invalid HTML and breaks Next hydration.
  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(mention)}
      aria-label={`${mention.mentions7d} dev.to tutorials${mention.topArticle ? `, top by @${mention.topArticle.author}` : ""}`}
      className={sizeClasses}
      style={{
        color: "var(--source-dev)",
        borderColor: "color-mix(in oklab, var(--source-dev) 45%, transparent)",
        background: isHighSignal
          ? "color-mix(in oklab, var(--source-dev) 10%, transparent)"
          : "var(--bg-050)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center bg-[var(--source-dev)] text-[7px] font-extrabold leading-none text-[var(--bg-000)]"
        aria-hidden
      >
        DEV
      </span>
      {mention.mentions7d}
    </Chip>
  );
}

// Re-export the underlying color so the channel-dot indicator can use
// the same source-of-truth without drifting on a brand refresh.
export const DEVTO_BRAND_COLOR = DEVTO_BLACK;

export default DevtoBadge;
