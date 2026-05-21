import Link from "next/link";

import type { Repo } from "@/lib/types";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import { MentionSourcePips } from "./MentionSourcePips";
import { RepoSparkline } from "./RepoSparkline";

interface FeaturedReposProps {
  repos: Repo[];
  fetchedAt: string | null;
}

const VARIANTS = [
  { className: "hot", label: "TOP", rankClass: "rank-top", stat: "24h velocity" },
  { className: "trend", label: "BREAKOUT", rankClass: "rank-breakout", stat: "7d consensus" },
  { className: "cool", label: "TREND", rankClass: "rank-trend", stat: "30d lift" },
] as const;

export function FeaturedRepos({ repos, fetchedAt }: FeaturedReposProps) {
  const top = [...repos].sort((a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0))[0];
  const breakout = [...repos].sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))[0];
  const trend = [...repos].sort((a, b) => (b.trendScore30d ?? 0) - (a.trendScore30d ?? 0))[0];
  const featured = [top, breakout, trend].filter(
    (r, i, a) => r && a.findIndex((x) => x?.id === r.id) === i,
  ) as Repo[];

  return (
    <div className="featured-row" aria-label="Featured repositories">
      {featured.map((repo, index) => {
        const variant = VARIANTS[index] ?? VARIANTS[0];
        const fresh = classifyFreshness("repos", repo.lastCommitAt || fetchedAt || new Date(0).toISOString());
        const freshCls = fresh.status === "live" ? "fresh-live" : fresh.status === "warn" ? "fresh-warm" : "fresh-cold";
        const href = `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
        const avatarUrl = repo.ownerAvatarUrl;
        const delta = index === 1 ? repo.starsDelta7d : index === 2 ? repo.starsDelta30d : repo.starsDelta24h;
        const velocity = repo.stars > 0 ? (delta / repo.stars) * 100 : 0;

        return (
          <article key={repo.id} className={`feat ${variant.className}`}>
            <div className="feat-head">
              <div className="feat-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="repo-id grow">
                <div className="repo-avatar feat-avatar">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" loading="lazy" width={40} height={40} />
                  ) : (
                    <span aria-hidden="true">{repo.owner.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="repo-text">
                  <Link className="repo-name" href={href} data-repo-hover data-repo={repo.fullName} prefetch={false}>
                    <span className="repo-owner">{repo.owner}/</span>
                    {repo.name}
                  </Link>
                </div>
              </div>
              <span className={`feat-rank-chip ${variant.rankClass}`}>{variant.label}</span>
            </div>

            <div className="feat-body">
              <p className="feat-desc">{repo.description || `${repo.fullName} is moving across the live source graph.`}</p>
              <div className="row gap-2 feat-meta">
                <span className={delta >= 0 ? "chip up" : "chip warn"}>
                  {delta >= 0 ? "+" : ""}
                  {compact(delta)} stars · {velocity.toFixed(1)}%
                </span>
                <span className={`fresh ${freshCls}`}>
                  <span className="pip" aria-hidden="true" /> {getStatusLabel(fresh.status)} · {fresh.ageLabel}
                </span>
              </div>
              <MentionSourcePips repo={repo} />
            </div>

            <div className="feat-foot">
              <div className="feat-stat">
                <span className="feat-stat-label">Stars</span>
                <span className="feat-stat-value">
                  {compact(repo.stars)} <span className={delta >= 0 ? "delta up-text" : "delta dn-text"}>{delta >= 0 ? "+" : ""}{compact(delta)}</span>
                </span>
              </div>
              <div className="feat-stat">
                <span className="feat-stat-label">{variant.stat}</span>
                <span className="feat-stat-value">
                  {(repo.channelsFiring ?? 0).toLocaleString()} <span className="delta up-text">sources</span>
                </span>
              </div>
              <RepoSparkline data={repo.sparklineData?.slice(-14)} repo={repo} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
