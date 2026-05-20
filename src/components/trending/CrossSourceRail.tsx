import Link from "next/link";

import type { Repo } from "@/lib/types";
import { MentionSourcePips } from "./MentionSourcePips";
import { RepoSparkline } from "./RepoSparkline";

interface CrossSourceRailProps {
  repos: Repo[];
  limit?: number;
}

export function CrossSourceRail({ repos, limit = 3 }: CrossSourceRailProps) {
  const rows = [...repos]
    .sort((a, b) => mentionScore(b) - mentionScore(a))
    .slice(0, limit);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Cross-source mentions</b>
        </h2>
        <span className="grow" />
        <span className="chip info">3 rails</span>
      </div>
      <div className="card-body">
        <div className="side-list cross-source-rail">
          {rows.map((repo, index) => {
            const href = `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
            const sources = repo.channelsFiring ?? activeSourceCount(repo);
            return (
              <Link key={repo.id} className="side-row cross-row" href={href} data-repo-hover data-repo={repo.fullName} prefetch={false}>
                <div className="side-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="cross-copy">
                  <span className="side-name">{repo.fullName}</span>
                  <span className="muted">
                    {sources} sources · {(repo.mentions?.total24h ?? repo.mentionCount24h ?? 0).toLocaleString()} mentions
                  </span>
                  <MentionSourcePips repo={repo} />
                </div>
                <RepoSparkline data={repo.sparklineData?.slice(-10)} repo={repo} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function mentionScore(repo: Repo): number {
  return (repo.mentions?.total24h ?? repo.mentionCount24h ?? 0) + (repo.channelsFiring ?? 0) * 100;
}

function activeSourceCount(repo: Repo): number {
  const perSource = repo.mentions?.perSource;
  if (!perSource) return 0;
  return Object.values(perSource).filter((source) => (source?.count24h ?? source?.count7d ?? 0) > 0).length;
}
