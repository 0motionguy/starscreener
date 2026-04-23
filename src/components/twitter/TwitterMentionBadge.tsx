"use client";

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
  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(fullName, signal)}
      aria-label={`${signal.mentionCount24h} X mentions for ${fullName}`}
      className={`inline-flex items-center gap-1 rounded-md border font-mono text-[10px] transition-colors cursor-pointer ${sizeClasses} ${
        breakout
          ? "border-brand/40 bg-brand/10 text-brand"
          : "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#4db7ff]"
      }`}
    >
      <span
        className={`flex h-3 w-3 items-center justify-center rounded-sm text-[8px] font-bold leading-none ${
          breakout ? "bg-brand text-white" : "bg-[#1d9bf0] text-white"
        }`}
        aria-hidden
      >
        X
      </span>
      {signal.mentionCount24h}
    </button>
  );
}

export default TwitterMentionBadge;
