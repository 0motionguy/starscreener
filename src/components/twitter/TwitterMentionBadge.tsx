"use client";

import { Chip } from "@/components/ui/Badge";
import type { Repo } from "@/lib/types";

interface TwitterMentionBadgeProps {
  fullName: string;
  signal: Repo["twitter"];
  size?: "sm" | "md";
}

function searchUrl(fullName: string): string {
  return `https://x.com/search?q=${encodeURIComponent(`"${fullName}"`)}`;
}

function buildTooltip(fullName: string, signal: NonNullable<Repo["twitter"]>): string {
  return `${signal.mentionCount24h} X mentions in 24h · ${signal.uniqueAuthors24h} authors · score ${signal.finalTwitterScore.toFixed(1)} · ${fullName}`;
}

export function TwitterMentionBadge({
  fullName,
  signal,
  size = "sm",
}: TwitterMentionBadgeProps) {
  if (!signal || signal.mentionCount24h <= 0) return null;

  const href = signal.topPostUrl || searchUrl(fullName);
  const breakout = signal.badgeState === "x_fire" || signal.finalTwitterScore >= 70;
  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";

  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(fullName, signal)}
      aria-label={`${signal.mentionCount24h} X mentions for ${fullName}`}
      className={sizeClasses}
      style={{
        color: breakout ? "var(--acc)" : "var(--source-x)",
        borderColor: breakout
          ? "rgba(255, 107, 53, 0.4)"
          : "color-mix(in oklab, var(--source-x) 45%, transparent)",
        background: breakout
          ? "var(--acc-soft)"
          : "color-mix(in oklab, var(--source-x) 10%, transparent)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center text-[8px] font-bold leading-none text-[var(--bg-000)]"
        style={{ background: breakout ? "var(--acc)" : "var(--source-x)" }}
        aria-hidden
      >
        X
      </span>
      {signal.mentionCount24h}
    </Chip>
  );
}

export default TwitterMentionBadge;
