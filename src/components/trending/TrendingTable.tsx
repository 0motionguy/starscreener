// TrendingTable emits the main `.tdata` contract for the Trending hub.
// Rows are derived from Repo[]; shell.js renders sparkline SVGs from data-points.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import type { CategoryId, WindowId } from "./TrendingHubHero";
import { MentionCell } from "./MentionSourcePips";
import { RepoSparkline } from "./RepoSparkline";
import { TrendingRowActions } from "./TrendingRowActions";
import { TrendingStar } from "./TrendingStar";

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
          <span className="pip" aria-hidden="true" /> {getStatusLabel(fresh?.status ?? "cold")} · {fresh?.ageLabel ?? "no timestamp"}
        </span>
      </div>

      <div className="period-switcher">
        <span className="period-label">Velocity period:</span>
        {PERIODS.map((period) => (
          <Link
            key={period}
            href={{ query: cleanQuery({ cat: category, window: period, lang: language, sort }) }}
            className={`period-tab${period === timeWindow ? " active" : ""}`}
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
            <th className="num col-stars">Stars</th>
            <th className="num col-velocity">24h</th>
            <th className="num col-velocity">7d</th>
            <th className="num col-velocity">30d</th>
            <th className="col-spark">Trend</th>
            <th className="num col-meta">Mentions</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {top.map((repo, idx) => {
            const owner = repo.owner;
            const name = repo.name;
            const stars = repo.stars ?? 0;
            const delta24h = repo.starsDelta24h ?? 0;
            const delta7d = repo.starsDelta7d ?? 0;
            const delta30d = repo.starsDelta30d ?? 0;
            const detailHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
            const points = repo.sparklineData ?? [];
            const trendPoints = points.slice(-30);
            const avatarUrl = repo.ownerAvatarUrl;
            const rankClass =
              idx === 0 ? "rank top top-1" : idx === 1 ? "rank top top-2" : idx === 2 ? "rank top top-3" : "rank";

            return (
              <tr key={repo.id} className="stagger-row" style={{ animationDelay: `${Math.min(idx * 0.03, 0.25)}s` }}>
                <td data-label="Rank">
                  <span className={rankClass}>{String(idx + 1).padStart(2, "0")}</span>
                </td>
                <td data-label="Repo">
                  <div className="repo-id">
                    <Link
                      className="repo-avatar"
                      href={detailHref}
                      prefetch={false}
                      aria-label={`${owner}/${name} detail`}
                    >
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" loading="lazy" width={28} height={28} />
                      ) : (
                        <span aria-hidden="true">{owner.slice(0, 2).toUpperCase()}</span>
                      )}
                    </Link>
                    <div className="repo-text">
                      <Link className="repo-name" href={detailHref} data-repo-hover data-repo={`${owner}/${name}`} prefetch={false}>
                        <span className="repo-owner">{owner}/</span>
                        {name}
                      </Link>
                      <div className="repo-desc">{repo.description || "No description published."}</div>
                    </div>
                  </div>
                </td>
                <td className="num col-stars-cell" data-label="Stars">
                  <TrendingStar />
                  <span className="star-value">{compact(stars)}</span>
                </td>
                <PeriodCell delta={delta24h} stars={stars} label="24h" highlight={timeWindow === "24h"} />
                <PeriodCell delta={delta7d} stars={stars} label="7d" highlight={timeWindow === "7d"} />
                <PeriodCell delta={delta30d} stars={stars} label="30d" highlight={timeWindow === "30d"} />
                <td className="col-spark-cell" data-label="Trend">
                  <RepoSparkline data={trendPoints} repo={repo} />
                </td>
                <td className="num mention-pack-cell" data-label="Mentions">
                  <Link
                    href={detailHref}
                    className="mention-link"
                    aria-label={`${owner}/${name} mentions detail`}
                    prefetch={false}
                  >
                    <MentionCell repo={repo} />
                  </Link>
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

interface PeriodCellProps {
  delta: number;
  stars: number;
  label: string;
  highlight: boolean;
}

function PeriodCell({ delta, stars, label, highlight }: PeriodCellProps) {
  const pct = stars > 0 ? (delta / stars) * 100 : 0;
  const dir = delta > 0 ? "up" : delta < 0 ? "dn" : "flat";
  const deltaText = delta === 0 ? "—" : delta > 0 ? `+${compact(delta)}` : compact(delta);
  const pctText = delta === 0 ? "" : pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;

  return (
    <td className={`num period-cell period-${dir}${highlight ? " period-active" : ""}`} data-label={label}>
      <span className="period-delta">{deltaText}</span>
      {pctText && <span className="period-pct">{pctText}</span>}
    </td>
  );
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
