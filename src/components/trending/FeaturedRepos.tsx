import Link from "next/link";

import type { Repo } from "@/lib/types";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import { MentionSourcePips } from "./MentionSourcePips";
import { RepoSparkline } from "./RepoSparkline";

interface FeaturedReposProps {
  repos: Repo[];
  fetchedAt: string | null;
  /** Lowercased fullNames listed in the last 24h — pins a NEW card to the front. */
  newSet?: Set<string>;
}

type Variant = {
  className: string;
  label: string;
  rankClass: string;
  stat: string;
};
type DeltaWindow = "24h" | "7d" | "30d";
type Slot = { repo: Repo; variant: Variant; deltaWindow: DeltaWindow };

const TOP: Variant = { className: "hot", label: "TOP", rankClass: "rank-top", stat: "24h velocity" };
const BREAKOUT: Variant = { className: "trend", label: "BREAKOUT", rankClass: "rank-breakout", stat: "7d consensus" };
const TREND: Variant = { className: "cool", label: "TREND", rankClass: "rank-trend", stat: "30d lift" };
const NEW: Variant = { className: "new", label: "NEW", rankClass: "rank-new", stat: "just listed" };

export function FeaturedRepos({ repos, fetchedAt, newSet }: FeaturedReposProps) {
  const top = [...repos].sort((a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0))[0];
  const breakout = [...repos].sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))[0];
  const trend = [...repos].sort((a, b) => (b.trendScore30d ?? 0) - (a.trendScore30d ?? 0))[0];

  const base: Slot[] = (
    [
      { repo: top, variant: TOP, deltaWindow: "24h" },
      { repo: breakout, variant: BREAKOUT, deltaWindow: "7d" },
      { repo: trend, variant: TREND, deltaWindow: "30d" },
    ] as Slot[]
  ).filter((s) => s.repo);

  // Pin a freshly-dropped repo (present in the visible set) to the front as
  // NEW. A brand-new drop not yet folded into the derived set still surfaces
  // via the ticker + /drop live feed, so this degrades gracefully.
  const newRepo =
    newSet && newSet.size > 0
      ? repos.find((r) => newSet.has(r.fullName.toLowerCase()))
      : undefined;

  let slots: Slot[] = base.filter(
    (s, i, a) => a.findIndex((x) => x.repo.id === s.repo.id) === i,
  );
  if (newRepo) {
    slots = [
      { repo: newRepo, variant: NEW, deltaWindow: "24h" },
      ...slots.filter((s) => s.repo.id !== newRepo.id),
    ];
  }
  slots = slots.slice(0, 3);

  return (
    <div className="featured-row" aria-label="Featured repositories">
      {slots.map((slot, index) => {
        const repo = slot.repo;
        const variant = slot.variant;
        const fresh = classifyFreshness("repos", repo.lastCommitAt || fetchedAt || new Date(0).toISOString());
        const freshCls = fresh.status === "live" ? "fresh-live" : fresh.status === "warn" ? "fresh-warm" : "fresh-cold";
        const href = `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
        const avatarUrl = repo.ownerAvatarUrl;
        const delta = slot.deltaWindow === "7d" ? repo.starsDelta7d : slot.deltaWindow === "30d" ? repo.starsDelta30d : repo.starsDelta24h;
        const velocity = repo.stars > 0 ? (delta / repo.stars) * 100 : 0;

        return (
          <article key={repo.id} className={`feat ${variant.className}`}>
            <div className="feat-head">
              <div className="feat-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="repo-id grow">
                <Link
                  className="repo-avatar feat-avatar"
                  href={href}
                  prefetch={false}
                  aria-label={`${repo.owner}/${repo.name} detail`}
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" loading="lazy" width={40} height={40} />
                  ) : (
                    <span aria-hidden="true">{repo.owner.slice(0, 2).toUpperCase()}</span>
                  )}
                </Link>
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
              <RepoSparkline data={repo.sparklineData?.slice(-30)} repo={repo} />
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
