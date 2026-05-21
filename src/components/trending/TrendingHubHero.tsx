// TrendingHubHero — page-head with eyebrow, title, subtitle, period segmented,
// and 5-way category switcher. Server component; switcher reads `?cat=` and
// `?window=` query params from props.

import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import { getLastFetchedAt, getTrackedRepoCount } from "@/lib/trending";
import Link from "next/link";

const CATEGORIES = [
  { id: "repos", label: "Repos", glyph: "R" },
  { id: "skills", label: "Skills", glyph: "S" },
  { id: "agents", label: "Agents", glyph: "A" },
  { id: "llms", label: "LLMs · HF Models", glyph: "L" },
  { id: "mcp", label: "MCP Servers", glyph: "M" },
] as const;

const WINDOWS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];
type WindowId = (typeof WINDOWS)[number]["id"];

interface TrendingHubHeroProps {
  category: CategoryId;
  window: WindowId;
  /** Per-category counts to render in the switcher pill. */
  counts?: Partial<Record<CategoryId, number>>;
}

export function TrendingHubHero({ category, window: timeWindow }: TrendingHubHeroProps) {
  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();
  const fresh = fetchedAt ? classifyFreshness("repos", fetchedAt) : null;
  const tracked = (() => {
    try {
      return getTrackedRepoCount();
    } catch {
      return 0;
    }
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <span className={`live-dot ${fresh?.status ?? "cold"}`} aria-hidden="true" />{" "}
            <b>{getStatusLabel(fresh?.status ?? "cold")}</b> · scanned {fresh?.ageLabel ?? "—"} · 30 mention sources ·{" "}
            {tracked.toLocaleString()} candidates
          </div>
          <h1 className="page-title">Trending — the radar for everything AI</h1>
          <p className="page-sub">Cross-signal scoring · refreshed every 30 minutes</p>
        </div>
        <div className="segmented" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <Link
              key={w.id}
              href={{ query: { window: w.id, cat: category } }}
              className={w.id === timeWindow ? "on" : ""}
              prefetch={false}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

export type { CategoryId, WindowId };
export { CATEGORIES, WINDOWS };
