// TrendingTable emits the main `.tdata` contract for the Trending hub.
// Rows are derived from Repo[]; shell.js renders sparkline SVGs from data-points.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import { classifyFreshness } from "@/lib/news/freshness";
import type { CategoryId, WindowId } from "./TrendingHubHero";
import { MentionCell } from "./MentionSourcePips";
import { RepoSparkline } from "./RepoSparkline";
import { TrendingRowActions } from "./TrendingRowActions";

interface TrendingTableProps {
  repos: Repo[];
  fetchedAt: string | null;
  window: WindowId;
  limit?: number;
  category?: CategoryId;
  language?: string;
  sort?: string;
}

const PERIODS: WindowId[] = ["24h", "7d", "30d"];

export function TrendingTable({
  repos,
  fetchedAt,
  window: timeWindow,
  limit = 50,
  category = "repos",
  language = "all",
  sort = "momentum",
}: TrendingTableProps) {
  const top = repos.slice(0, limit);
  const fresh = fetchedAt ? classifyFreshness("repos", fetchedAt) : null;
  const freshCls = fresh?.status === "live" ? "fresh-live" : fresh?.status === "warn" ? "fresh-warm" : "fresh-cold";
  const windowLabel = timeWindow.toUpperCase();

  return (
    <div className="card trending-table-card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Live · top {top.length} repos</b> · sorted by {sortLabel(sort)} across {windowLabel}
        </h2>
        <span className="grow" />
        <span className={`fresh ${freshCls}`}>
          <span className="pip" /> {fresh?.status?.toUpperCase() ?? "COLD"} · {fresh?.ageLabel ?? "no timestamp"}
        </span>
      </div>

      <div className="period-switcher" role="tablist" aria-label="Velocity period">
        <span className="period-label">Velocity period:</span>
        {PERIODS.map((period) => (
          <Link
            key={period}
            href={{ query: cleanQuery({ cat: category, window: period, lang: language, sort }) }}
            className={`period-tab${period === timeWindow ? " active" : ""}`}
            role="tab"
            aria-selected={period === timeWindow}
            prefetch={false}
          >
            {period}
          </Link>
        ))}
        <span className="period-hint">Click to re-sort top {top.length}</span>
      </div>

      <table className="tdata">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th>Repository</th>
            <th className="num">Stars</th>
            <th className="col-velocity">Velocity ({windowLabel})</th>
            <th className="col-spark">7d</th>
            <th className="col-spark">30d</th>
            <th className="num col-meta">Mentions</th>
            <th className="col-meta">Fresh</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {top.map((repo, idx) => {
            const owner = repo.owner;
            const name = repo.name;
            const stars = repo.stars ?? 0;
            const delta = deltaForWindow(repo, timeWindow);
            const pct = stars > 0 ? (delta / stars) * 100 : 0;
            const velocityPctRaw = Math.min(100, Math.max(4, Math.abs(pct) * 10));
            const velocityCls = delta >= 0 ? "velocity up" : "velocity dn";
            const rowFresh = repo.lastCommitAt ? classifyFreshness("repos", repo.lastCommitAt) : fresh;
            const rowFreshCls =
              rowFresh?.status === "live"
                ? "fresh-live"
                : rowFresh?.status === "warn"
                  ? "fresh-warm"
                  : "fresh-cold";
            const detailHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
            const points = repo.sparklineData ?? [];

            return (
              <tr key={repo.id} className="stagger-row" style={{ animationDelay: `${Math.min(idx * 0.03, 0.4)}s` }}>
                <td data-label="Rank">
                  <span className={`rank${idx < 3 ? " top" : ""}`}>{String(idx + 1).padStart(2, "0")}</span>
                </td>
                <td data-label="Repo">
                  <div className="repo-id">
                    <div className="repo-avatar avatar-token" aria-hidden="true">
                      {owner.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="repo-text">
                      <Link className="repo-name" href={detailHref} data-repo-hover data-repo={`${owner}/${name}`} prefetch={false}>
                        <span className="repo-owner">{owner}/</span>
                        {name}
                      </Link>
                      <div className="repo-desc">{repo.description || "No description published."}</div>
                    </div>
                  </div>
                </td>
                <td className="num" data-label="Stars">
                  {compact(stars)}{" "}
                  {delta !== 0 && (
                    <span className={delta >= 0 ? "up-text" : "dn-text"}>
                      {delta >= 0 ? `+${compact(delta)}` : compact(delta)}
                    </span>
                  )}
                </td>
                <td data-label="Velocity">
                  <div className={velocityCls}>
                    <span className="num">{pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}</span>
                    <div className="velocity-bar" style={{ ["--v" as string]: `${velocityPctRaw}%` }} />
                  </div>
                </td>
                <td data-label="Trend7d">
                  <RepoSparkline data={points.slice(-14)} repo={repo} />
                </td>
                <td data-label="Trend30d">
                  <RepoSparkline data={points.slice(-30)} repo={repo} />
                </td>
                <td className="num mention-pack-cell" data-label="Mentions">
                  <MentionCell repo={repo} />
                </td>
                <td data-label="Fresh">
                  <span className={`fresh ${rowFreshCls}`}>
                    <span className="pip" /> {rowFresh?.ageLabel ?? "no timestamp"}
                  </span>
                </td>
                <td className="row-actions-cell" data-label="Actions">
                  <TrendingRowActions repo={`${owner}/${name}`} />
                </td>
              </tr>
            );
          })}
          {top.length === 0 && (
            <tr>
              <td colSpan={9} className="table-message">
                Live source graph is refreshing; route chrome remains populated while the cache reloads.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="table-foot">
        <div className="muted">
          Showing <span className="num">{top.length}</span> of <span className="num">{repos.length}</span> · ranked by momentum, velocity, and consensus
        </div>
        <div className="row gap-2">
          <Link className="btn ghost sm" href={{ query: cleanQuery({ cat: category, window: timeWindow, lang: language, sort }) }} prefetch={false}>
            Prev
          </Link>
          <Link className="btn ghost sm" href={{ query: cleanQuery({ cat: category, window: timeWindow, lang: language, sort }) }} prefetch={false}>
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}

function deltaForWindow(repo: Repo, window: WindowId): number {
  if (window === "7d") return repo.starsDelta7d ?? 0;
  if (window === "30d") return repo.starsDelta30d ?? 0;
  return repo.starsDelta24h ?? 0;
}

function sortLabel(sort: string): string {
  if (sort === "mentions") return "mention velocity";
  if (sort === "stars") return "stars";
  if (sort === "consensus") return "consensus";
  return "momentum";
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function cleanQuery(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== "all" && value !== ""));
}
