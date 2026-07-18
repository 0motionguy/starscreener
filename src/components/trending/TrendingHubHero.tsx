// TrendingHubHero — page-head with eyebrow, title, subtitle, period segmented,
// and 5-way category switcher. Server component; switcher reads `?cat=` and
// `?window=` query params from props.

import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import { getLastFetchedAt } from "@/lib/trending";
// Registry-inclusive tracked count: every repo ever seen (trending + recent +
// repo-registry + manual + pipeline). Used to be the cold trending-only count
// from getTrackedRepoCount, which under-reported once the persistent registry
// shipped (732 vs the canonical 838+).
import { getDerivedRepoCount } from "@/lib/derived-repos";

const CATEGORIES = [
  { id: "repos", label: "Repos", glyph: "R" },
  { id: "agents", label: "Agents", glyph: "A" },
  { id: "skills", label: "Skills", glyph: "S" },
  { id: "llms", label: "LLMs", glyph: "L" },
  { id: "models", label: "Models", glyph: "M" },
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
      return getDerivedRepoCount();
    } catch {
      return 0;
    }
  })();

  void timeWindow; // window switcher moved to TrendingControlBar (below FeaturedRepos)
  void category; // category switcher dropped — operator: "all its only about AI"
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">
          <span className={`live-dot ${fresh?.status ?? "cold"}`} aria-hidden="true" />{" "}
          <b>{getStatusLabel(fresh?.status ?? "cold")}</b> · scanned {fresh?.ageLabel ?? "—"} · 30 mention sources
        </div>
        <h1 className="page-title">Trending — the radar for everything AI</h1>
        <p className="page-sub">Cross-signal scoring · refreshed every 30 minutes</p>
      </div>
      <div className="page-head-stat" aria-label="Repos tracked">
        <span className="page-head-stat-eyebrow">
          <span className="live-dot live" aria-hidden="true" />
          tracked live
        </span>
        <span className="page-head-stat-value">
          <span className="page-head-stat-arrow" aria-hidden="true">↗</span>
          {tracked.toLocaleString()}
        </span>
        <span className="page-head-stat-label">repos &middot; scanned every 30 min</span>
      </div>
    </div>
  );
}

export type { CategoryId, WindowId };
export { CATEGORIES, WINDOWS };
