// TrendingTable emits the main `.tdata` contract for the Trending hub.
// Rows are derived from Repo[]; shell.js renders sparkline SVGs from data-points.
//
// Column set: # · Repository · ★ Stars · 24H · 7D · 30D · Chart · Mentions · Actions
//   - 24H / 7D / 30D show the *star delta* for that window (color-coded).
//   - Chart is a single sparkline column between 30D and Mentions.
//   - Mentions emits .smark logos per active source via MentionCell.
//   - Rank 01/02/03 get gold/silver/bronze styling on top of .rank.top.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import { classifyFreshness } from "@/lib/news/freshness";
import { repoLogoUrl } from "@/lib/logos";
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
  const freshCls =
    fresh?.status === "live"
      ? "fresh-live"
      : fresh?.status === "warn"
        ? "fresh-warm"
        : "fresh-cold";
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
            <th className="num">
              <span className="stars-symbol" aria-hidden="true">★</span> Stars
            </th>
            <th className="num">24H</th>
            <th className="num">7D</th>
            <th className="num">30D</th>
            <th className="col-spark">Chart</th>
            <th className="num col-meta">Mentions</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {top.map((repo, idx) => {
            const owner = repo.owner;
            const name = repo.name;
            const stars = repo.stars ?? 0;
            const d24h = repo.starsDelta24h ?? 0;
            const d7d = repo.starsDelta7d ?? 0;
            const d30d = repo.starsDelta30d ?? 0;
            const detailHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
            const points = repo.sparklineData ?? [];
            const rankTier =
              idx === 0
                ? "rank-gold"
                : idx === 1
                  ? "rank-silver"
                  : idx === 2
                    ? "rank-bronze"
                    : "";

            return (
              <tr key={repo.id} className="stagger-row" style={{ animationDelay: `${Math.min(idx * 0.03, 0.4)}s` }}>
                <td data-label="Rank">
                  <span className={`rank${idx < 3 ? " top" : ""} ${rankTier}`.trim()}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                </td>
                <td data-label="Repo">
                  <div className="repo-id">
                    <div
                      className="repo-avatar avatar-token"
                      aria-hidden="true"
                      style={{ position: "relative", overflow: "hidden" }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "grid",
                          placeItems: "center",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--fg-muted)",
                          background: "var(--surface-3)",
                          zIndex: 0,
                        }}
                      >
                        {owner.slice(0, 2).toUpperCase()}
                      </span>
                      <img
                        src={repoLogoUrl(repo.fullName, 40) ?? ""}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        style={{
                          position: "relative",
                          display: "block",
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 2,
                          zIndex: 1,
                        }}
                      />
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
                <td className="num stars-cell" data-label="Stars">
                  <span className="stars-symbol" aria-hidden="true">★</span>{" "}
                  <span className="stars-value">{compact(stars)}</span>
                </td>
                <td className="num delta-cell" data-label="24H">
                  {formatDelta(d24h)}
                </td>
                <td className="num delta-cell" data-label="7D">
                  {formatDelta(d7d)}
                </td>
                <td className="num delta-cell" data-label="30D">
                  {formatDelta(d30d)}
                </td>
                <td data-label="Chart">
                  <RepoSparkline data={points.slice(-30)} repo={repo} />
                </td>
                <td className="num mention-pack-cell" data-label="Mentions">
                  <MentionCell repo={repo} />
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

function formatDelta(value: number): React.ReactNode {
  if (value === 0) {
    return <span className="delta-zero">—</span>;
  }
  const cls = value > 0 ? "up-text" : "dn-text";
  const prefix = value > 0 ? "+" : "";
  return <span className={cls}>{prefix}{compact(value)}</span>;
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
