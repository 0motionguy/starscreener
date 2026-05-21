import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";

export const TOOLS_FILTERS = [
  { id: "all", label: "All" },
  { id: "charts", label: "Charts" },
  { id: "estimators", label: "Estimators" },
  { id: "contribute", label: "Contribute" },
] as const;

export type ToolsFilter = (typeof TOOLS_FILTERS)[number]["id"];

interface ToolsHubHeroProps {
  filter: ToolsFilter;
  toolsLive: number;
  toolsTotal: number;
  fetchedAt: string | null;
}

export function ToolsHubHero({
  filter,
  toolsLive,
  toolsTotal,
  fetchedAt,
}: ToolsHubHeroProps) {
  return (
    <div
      className="tools-head"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "end",
        gap: 18,
        padding: "6px 0 14px",
      }}
    >
      <div>
        <div
          className="page-eyebrow"
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <FreshnessPill source="repos" fetchedAt={fetchedAt} prefix="TOOLBOX" />
          <span style={{ color: "var(--fg-faint)" }}>
            /tools - {toolsLive} share-worthy utilities - watchlist, compare, tier-list, star-history, top-10
          </span>
        </div>
        <h1 className="page-title">Tools that make GitHub scanning shareable.</h1>
        <p className="page-sub">
          Pin your repos, rank them, plot the curves, freeze the daily top-10 -
          then screenshot the result and post it. Every tool ships with a built-in
          share card so your scan reads as a clean post on X, Reddit, or Discord.
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Tool filter">
        {TOOLS_FILTERS.map((item) => (
          <Link
            key={item.id}
            href={item.id === "all" ? "/tools" : `/tools?filter=${item.id}`}
            className={item.id === filter ? "on" : ""}
            prefetch={false}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
