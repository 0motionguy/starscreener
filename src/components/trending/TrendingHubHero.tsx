// TrendingHubHero — page-head with eyebrow, title, subtitle, period segmented,
// and 5-way category switcher. Server component; switcher reads `?cat=` and
// `?window=` query params from props.

import { classifyFreshness } from "@/lib/news/freshness";
import { getLastFetchedAt, getTrackedRepoCount } from "@/lib/trending";
import Link from "next/link";

const CATEGORIES = [
  { id: "repos", label: "Repos", glyph: "R" },
  { id: "skills", label: "Skills", glyph: "S" },
  { id: "mcp", label: "MCP Servers", glyph: "M" },
  { id: "agents", label: "Agents", glyph: "A" },
  { id: "llms", label: "LLMs · HF Models", glyph: "L" },
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

export function TrendingHubHero({ category, window: timeWindow, counts }: TrendingHubHeroProps) {
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
            <span className="live-dot" /> <b>{fresh?.status === "live" ? "LIVE" : fresh?.status === "warn" ? "WARM" : "STALE"}</b> · scanned{" "}
            {fresh?.ageLabel ?? "—"} · 30 mention sources · {tracked.toLocaleString()} candidates
          </div>
          <h1 className="page-title">Trending — the radar for everything AI</h1>
          <p className="page-sub">
            Repos, skills, MCP servers, agents, models. Cross-signal scoring across GitHub, HN, Reddit, X,
            Bluesky, ProductHunt, Dev.to and 23 more. Updated every 30 min.
          </p>
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

      <div className="switcher" data-tabset>
        {CATEGORIES.map((c) => {
          const ct = counts?.[c.id];
          return (
            <Link
              key={c.id}
              href={{ query: { cat: c.id, window: timeWindow } }}
              data-tab={c.id}
              className={c.id === category ? "on" : ""}
              prefetch={false}
            >
              <span aria-hidden="true">{c.glyph}</span>
              {c.label}
              {ct !== undefined && <span className="sw-count">{ct.toLocaleString()}</span>}
            </Link>
          );
        })}
      </div>
    </>
  );
}

export type { CategoryId, WindowId };
export { CATEGORIES, WINDOWS };
