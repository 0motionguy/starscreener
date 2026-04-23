import type { TwitterRepoRowBadge } from "@/lib/twitter/types";

interface XSignalBadgeProps {
  badge: TwitterRepoRowBadge | null | undefined;
}

export function XSignalBadge({ badge }: XSignalBadgeProps) {
  if (!badge || !badge.showBadge || !badge.label) return null;

  const breakout = badge.isBreakout;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider ${
        breakout
          ? "border-brand/40 bg-brand/10 text-brand"
          : "border-[#1d9bf0]/40 bg-[#1d9bf0]/10 text-[#4db7ff]"
      }`}
      title={badge.tooltip}
    >
      {badge.label}
    </span>
  );
}

export default XSignalBadge;
