// TrendingTable — main `.tdata` table for the Trending hub. Server component.
// Rows derived from `Repo[]` (use getDerivedRepos for enriched data).

import type { Repo } from "@/lib/types";
import { classifyFreshness } from "@/lib/news/freshness";
import { MentionCell } from "./MentionSourcePips";
import { RepoSparkline } from "./RepoSparkline";

interface TrendingTableProps {
  repos: Repo[];
  /** Fresh fetchedAt for the data set — drives per-row freshness pill. */
  fetchedAt: string | null;
  limit?: number;
}

export function TrendingTable({ repos, fetchedAt, limit = 50 }: TrendingTableProps) {
  const top = repos.slice(0, limit);
  const fresh = fetchedAt ? classifyFreshness("repos", fetchedAt) : null;
  const freshCls = fresh?.status === "live" ? "fresh-live" : fresh?.status === "warn" ? "fresh-warm" : "fresh-cold";

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head">
        <h2 className="card-title">
          ▸ <b>Live · top {top.length} repos</b> · sorted by 24h momentum
        </h2>
        <span className="grow" />
        <span className={`fresh ${freshCls}`}>
          <span className="pip" /> {fresh?.status?.toUpperCase() ?? "—"} · {fresh?.ageLabel ?? "—"}
        </span>
      </div>

      <table className="tdata">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th>Repository</th>
            <th className="num">Stars</th>
            <th className="col-velocity">Velocity (24h)</th>
            <th className="col-spark">Trend</th>
            <th className="num col-meta">Mentions</th>
            <th className="col-meta">Fresh</th>
          </tr>
        </thead>
        <tbody>
          {top.map((repo, idx) => {
            const owner = repo.owner;
            const name = repo.name;
            const stars = repo.stars ?? 0;
            const delta = repo.starsDelta24h ?? 0;
            const total = stars > 0 ? stars : 0;
            const pct = total ? (delta / total) * 100 : 0;
            const velocityPctRaw = Math.min(100, Math.max(0, Math.abs(pct) * 10));
            const velocityCls = delta >= 0 ? "velocity up" : "velocity dn";
            const rowFresh = repo.lastCommitAt
              ? classifyFreshness("repos", repo.lastCommitAt)
              : fresh;
            const rowFreshCls =
              rowFresh?.status === "live"
                ? "fresh-live"
                : rowFresh?.status === "warn"
                  ? "fresh-warm"
                  : "fresh-cold";
            const detailHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

            return (
              <tr key={repo.id} className="stagger-row" style={{ animationDelay: `${Math.min(idx * 0.03, 0.4)}s` }}>
                <td data-label="Rank">
                  <span className={`rank${idx < 3 ? " top" : ""}`}>{String(idx + 1).padStart(2, "0")}</span>
                </td>
                <td data-label="Repo">
                  <div className="repo-id">
                    <div
                      className="repo-avatar"
                      style={{
                        background: "var(--surface-3)",
                        color: "var(--accent)",
                        fontSize: 11,
                      }}
                      aria-hidden="true"
                    >
                      {owner.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="repo-text">
                      <a className="repo-name" href={detailHref} data-repo-hover data-repo={`${owner}/${name}`}>
                        <span className="repo-owner">{owner}/</span>
                        {name}
                      </a>
                      <div className="repo-desc">{repo.description || "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="num" data-label="Stars">
                  {stars.toLocaleString()}{" "}
                  {delta !== 0 && (
                    <span className={delta >= 0 ? "up-text" : "dn-text"}>
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </td>
                <td data-label="Velocity">
                  <div className={velocityCls}>
                    <span className="num">{pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}</span>
                    <div className="velocity-bar" style={{ ["--v" as string]: `${velocityPctRaw}%` }} />
                  </div>
                </td>
                <td data-label="Trend">
                  <RepoSparkline repo={repo} />
                </td>
                <td className="num" data-label="Mentions">
                  <MentionCell repo={repo} />
                </td>
                <td data-label="Fresh">
                  <span className={`fresh ${rowFreshCls}`}>
                    <span className="pip" /> {rowFresh?.ageLabel ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
          {top.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--fg-muted)" }}>
                No trending repos cached yet — try{" "}
                <code style={{ color: "var(--accent)" }}>npm run scrape:reddit</code> or check{" "}
                <code style={{ color: "var(--accent)" }}>/api/healthz</code>.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
