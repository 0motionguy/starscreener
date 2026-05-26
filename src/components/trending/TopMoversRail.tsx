// TopMoversRail renders the right-column "Top movers · 24h velocity" card.

import Link from "next/link";

import { getDerivedRepos } from "@/lib/derived-repos";
import { RepoSparkline } from "./RepoSparkline";

export function TopMoversRail({ limit = 8 }: { limit?: number }) {
  const movers = (() => {
    try {
      return [...getDerivedRepos()]
        .sort((a, b) => (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0))
        .slice(0, limit);
    } catch {
      return [];
    }
  })();

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Top movers</b> · 24h velocity
        </h2>
      </div>
      <div className="card-body">
        <div className="side-list">
          {movers.map((repo) => {
            const href = `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
            const delta = repo.starsDelta24h ?? 0;
            const pct = repo.stars ? (delta / repo.stars) * 100 : 0;
            return (
              <Link key={repo.id} className="side-row mover-row" href={href} data-repo-hover data-repo={repo.fullName} prefetch={false}>
                <div className="repo-avatar avatar-token mini" aria-hidden="true">
                  {repo.owner.slice(0, 2).toUpperCase()}
                </div>
                <div className="side-copy">
                  <span className="side-name">{repo.fullName}</span>
                  <span className="muted">
                    {compact(repo.stars)} stars · {repo.language ?? "mixed"}
                  </span>
                  <RepoSparkline data={repo.sparklineData?.slice(-30)} repo={repo} />
                </div>
                <div className={delta >= 0 ? "side-delta up-text" : "side-delta dn-text"}>
                  {delta >= 0 ? "+" : ""}
                  {pct.toFixed(1)}%
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
