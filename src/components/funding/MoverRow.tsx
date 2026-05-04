// V4 — MoverRow
//
// Row primitive for funding.html § 02 "Biggest rounds · 24h" panel.
//
// Layout: rank · name+meta · raised · stage-pill
//
// Differs from RankRow in that:
//   - Stage pill at the right has its own color contract
//     (mega → orange, F/E/D/C/B/A → tier palette, seed → cyan)
//   - "raised" big-number is mono in --v4-money
//   - First row gets the green-rail treatment (not orange)
//
// Usage:
//   <MoverRow
//     rank={1}
//     name="Anthropic"
//     meta="AI labs · 4.0B post · led by Lightspeed"
//     amount="$2.0B"
//     stage="Series F"
//     first
//   />

import { cn } from "@/lib/utils";

export type FundingStage =
  | "Seed"
  | "Series A"
  | "Series B"
  | "Series C"
  | "Series D"
  | "Series E"
  | "Series F"
  | "Series F+"
  | "Growth"
  | "IPO"
  | "M&A";

export interface MoverRowProps {
  rank: number;
  name: string;
  meta?: string;
  amount: string;
  stage: FundingStage | string;
  /** Apply #1-row green-rail treatment. */
  first?: boolean;
  /** Optional href — renders as <a>. */
  href?: string;
  className?: string;
  /** Optional logo URL for the company avatar. */
  logoUrl?: string | null;
  /** Used for the monogram fallback when logoUrl is null. */
  logoName?: string;
}

export function MoverRow({
  rank,
  name,
  meta,
  amount,
  stage,
  first = false,
  href,
  className,
  logoUrl: _logoUrl,
  logoName: _logoName,
}: MoverRowProps) {
  const Tag = href ? "a" : "div";
  const stageCls = stageToClass(stage);
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "v4-mover-row",
        first && "v4-mover-row--first",
        className,
      )}
    >
      <span className="v4-mover-row__rank">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="v4-mover-row__body">
        <div className="v4-mover-row__name">{name}</div>
        {meta ? <div className="v4-mover-row__meta">{meta}</div> : null}
      </div>
      <div className="v4-mover-row__amt">
        {amount}
        <span className="v4-mover-row__amt-lbl">RAISED</span>
      </div>
      <span className={cn("v4-mover-row__stage", stageCls)}>{stage}</span>
    </Tag>
  );
}

function stageToClass(stage: string): string {
  // Series E/F/G + Growth/IPO are "mega" — orange treatment.
  const upper = stage.toUpperCase();
  if (
    upper.includes("F") ||
    upper.includes("E") ||
    upper === "GROWTH" ||
    upper === "IPO" ||
    upper === "M&A"
  ) {
    return "v4-mover-row__stage--mega";
  }
  if (upper.includes("D")) return "v4-mover-row__stage--d";
  if (upper.includes("C")) return "v4-mover-row__stage--c";
  if (upper.includes("B")) return "v4-mover-row__stage--b";
  if (upper.includes("A")) return "v4-mover-row__stage--a";
  if (upper.includes("SEED")) return "v4-mover-row__stage--seed";
  return "v4-mover-row__stage--default";
}
