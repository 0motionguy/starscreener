// TrendingControlBar — single consolidated filter strip BELOW FeaturedRepos.
// Replaces the prior 3-bar stack (category-tabs / window switcher / language filter).
// Operator decree: this is an AI-trending screener, no per-language slicing,
// no Skills/Agents/LLMs/MCP category split — KEY IS TRENDING.
// Three controls in one bar: rank mode + time window + sort metric.

import Link from "next/link";
import type { CategoryId, WindowId } from "./TrendingHubHero";

type SortId = "momentum" | "mentions" | "stars" | "consensus";
type RankerId = "top" | "gainer" | "trend" | "discovery";

interface ModeTab {
  id: string;
  label: string;
  cat: CategoryId;
  rank: RankerId;
  count?: number | null;
}

function buildModeTabs(counts: Partial<Record<CategoryId, number>>): ModeTab[] {
  const repoCount = counts.repos ?? null;
  return [
    { id: "repos-top",       label: "Top",       cat: "repos",  rank: "top",       count: repoCount },
    { id: "repos-discovery", label: "Discovery", cat: "repos",  rank: "discovery", count: repoCount },
    { id: "repos-gainer",    label: "Gainer",    cat: "repos",  rank: "gainer",    count: repoCount },
    { id: "repos-trend",     label: "Trend",     cat: "repos",  rank: "trend",     count: repoCount },
    { id: "agents",          label: "Agents",    cat: "agents", rank: "top",       count: counts.agents ?? null },
    { id: "llms",            label: "LLMs",      cat: "llms",   rank: "top",       count: counts.llms ?? null },
    { id: "models",          label: "Models",    cat: "models", rank: "top",       count: counts.models ?? null },
  ];
}

const WINDOWS: { id: WindowId; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
];

const SORTS: { id: SortId; label: string }[] = [
  { id: "momentum", label: "Momentum" },
  { id: "mentions", label: "Mentions" },
  { id: "stars", label: "Stars" },
  { id: "consensus", label: "Consensus" },
];

interface Props {
  activeCategory: CategoryId;
  activeRanker: RankerId;
  activeWindow: WindowId;
  activeSort: SortId;
  counts: Partial<Record<CategoryId, number>>;
}

function cleanQuery(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([k, v]) =>
        v !== "" &&
        !(k === "cat" && v === "repos") &&
        !(k === "rank" && v === "top") &&
        !(k === "sort" && v === "momentum") &&
        !(k === "window" && v === "24h"),
    ),
  );
}

export function TrendingControlBar({
  activeCategory,
  activeRanker,
  activeWindow,
  activeSort,
  counts,
}: Props) {
  const modeTabs = buildModeTabs(counts);
  return (
    <div className="trending-controlbar" aria-label="Trending controls">
      <div className="tcb-group" role="group" aria-label="Mode">
        {modeTabs.map((t) => {
          const isActive =
            activeCategory === t.cat &&
            (t.cat !== "repos" || activeRanker === t.rank);
          // "Top" is the canonical home view — always reset to `/` so clicking
          // it from any state navigates back without query-param baggage.
          const href =
            t.id === "repos-top"
              ? "/"
              : {
                  query: cleanQuery({
                    cat: t.cat,
                    rank: t.rank,
                    window: activeWindow,
                    sort: activeSort,
                  }),
                };
          return (
            <Link
              key={t.id}
              href={href}
              className={`tcb-btn${isActive ? " on" : ""}`}
              prefetch={false}
            >
              <span>{t.label}</span>
              {typeof t.count === "number" && (
                <span className="tcb-btn-count">{t.count.toLocaleString()}</span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="tcb-divider" aria-hidden="true" />
      <div className="tcb-group" role="group" aria-label="Time window">
        {WINDOWS.map((w) => (
          <Link
            key={w.id}
            href={{
              query: cleanQuery({
                cat: activeCategory,
                rank: activeRanker,
                window: w.id,
                sort: activeSort,
              }),
            }}
            className={`tcb-btn${w.id === activeWindow ? " on" : ""}`}
            prefetch={false}
          >
            {w.label}
          </Link>
        ))}
      </div>
      <div className="tcb-divider" aria-hidden="true" />
      <div className="tcb-group" role="group" aria-label="Sort">
        {SORTS.map((s) => (
          <Link
            key={s.id}
            href={{
              query: cleanQuery({
                cat: activeCategory,
                rank: activeRanker,
                window: activeWindow,
                sort: s.id,
              }),
            }}
            className={`tcb-btn${s.id === activeSort ? " on" : ""}`}
            prefetch={false}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
