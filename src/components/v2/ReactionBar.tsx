// V2 design-system primitive — segmented reaction bar.
// Visual breakdown of build / use / buy / invest proportions.

import type { ReactionCounts } from "@/lib/reactions-shape";

interface ReactionBarProps {
  reactions: ReactionCounts;
}

const COLORS: Record<keyof ReactionCounts, string> = {
  build: "bg-[#60A5FA]",
  use: "bg-[#C4C4C6]",
  buy: "bg-[#FBBF24]",
  invest: "bg-up",
};

export function ReactionBar({ reactions }: ReactionBarProps): React.ReactElement {
  const total = reactions.build + reactions.use + reactions.buy + reactions.invest || 1;
  const segs = [
    { key: "build" as const, color: COLORS.build, width: (reactions.build / total) * 100 },
    { key: "use" as const, color: COLORS.use, width: (reactions.use / total) * 100 },
    { key: "buy" as const, color: COLORS.buy, width: (reactions.buy / total) * 100 },
    { key: "invest" as const, color: COLORS.invest, width: (reactions.invest / total) * 100 },
  ];
  return (
    <div className="flex h-3 rounded-full overflow-hidden border border-border-primary shadow-inner">
      {segs.map((s) => (
        <div
          key={s.key}
          className={`${s.color} h-full`}
          style={{ width: `${s.width}%` }}
          title={`${s.key}: ${Math.round((s.width / 100) * total)}`}
        />
      ))}
    </div>
  );
}
