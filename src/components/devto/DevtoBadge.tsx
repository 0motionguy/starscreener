"use client";

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
  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";

  // High-engagement fill tier: top article ≥50 reactions OR ≥3 mentions.
  // Parallels HnBadge.everHitFrontPage and BskyBadge isHighSignal tiers.
  const isHighSignal =
    (mention.topArticle?.reactions ?? 0) >= 50 || mention.mentions7d >= 3;
  const fillClass = isHighSignal ? "bg-black/10 dark:bg-white/10" : "";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={buildTooltip(mention)}
      aria-label={`${mention.mentions7d} dev.to tutorials${mention.topArticle ? `, top by @${mention.topArticle.author}` : ""}`}
      className={`inline-flex items-center gap-1 rounded-md text-[10px] font-mono border transition-colors text-[#0a0a0a] dark:text-white border-[#0a0a0a]/30 dark:border-white/30 ${sizeClasses} ${fillClass}`}
    >
      <span
        className="text-white dark:text-[#0a0a0a] text-[7px] font-extrabold w-3 h-3 leading-none rounded-sm flex items-center justify-center bg-[#0a0a0a] dark:bg-white"
        aria-hidden
      >
        DEV
      </span>
      {mention.mentions7d}
    </a>
  );
}

// Re-export the underlying color so the channel-dot indicator can use
// the same source-of-truth without drifting on a brand refresh.
export const DEVTO_BRAND_COLOR = DEVTO_BLACK;

export default DevtoBadge;
