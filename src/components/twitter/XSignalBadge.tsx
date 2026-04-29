import type { TwitterRepoRowBadge } from "@/lib/twitter/types";
import { Badge } from "@/components/ui/Badge";

interface XSignalBadgeProps {
  badge: TwitterRepoRowBadge | null | undefined;
}

export function XSignalBadge({ badge }: XSignalBadgeProps) {
  if (!badge || !badge.showBadge || !badge.label) return null;

  const breakout = badge.isBreakout;
  return (
    <Badge
      tone={breakout ? "accent" : "external"}
      size="sm"
      title={badge.tooltip}
    >
      {badge.label}
    </Badge>
  );
}

export default XSignalBadge;
