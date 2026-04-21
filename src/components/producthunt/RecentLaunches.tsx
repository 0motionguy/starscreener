// Recent Launches — homepage section showing the top AI-adjacent
// ProductHunt launches in the last 7 days.
//
// Server component. Reads the pre-scraped JSON via the producthunt loader.
// Hidden entirely when zero launches (cold start or failed scrape) so the
// homepage never shows an empty orange block on bad days. Each row links
// to the PH post URL, with a secondary link to the repo page on
// StarScreener when the launch links to a tracked repo.

import Link from "next/link";
import { getAiLaunches, producthuntCold } from "@/lib/producthunt";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

interface RecentLaunchesProps {
  limit?: number;
  days?: number;
}

const PH_ORANGE = "#DA552F";

function formatAge(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function RecentLaunches({
  limit = 5,
  days = 7,
}: RecentLaunchesProps = {}) {
  if (producthuntCold) return null;
  // Homepage section is the AI-adjacent stream specifically — the broader
  // "all launches" view lives at /producthunt?tab=all.
  const launches = getAiLaunches(days, limit);
  if (launches.length === 0) return null;

  return (
    <section
      aria-labelledby="recent-launches-heading"
      className="rounded-card border border-border-primary bg-bg-card shadow-card"
    >
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2
          id="recent-launches-heading"
          className="font-mono text-[11px] uppercase tracking-wider text-text-secondary inline-flex items-center gap-1.5"
        >
          <span aria-hidden style={{ color: PH_ORANGE }}>
            ▲
          </span>
          Recent Launches
        </h2>
        <p className="text-[11px] text-text-tertiary">
          Last {days}d · ProductHunt
        </p>
      </header>

      <ol className="divide-y divide-border-primary/40">
        {launches.map((l) => {
          const trackedRepo = l.linkedRepo
            ? getDerivedRepoByFullName(l.linkedRepo)
            : null;
          return (
            <li key={l.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                {l.thumbnail ? (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    aria-label={`${l.name} on ProductHunt`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.thumbnail}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      className="size-12 rounded-md border border-border-primary bg-bg-tertiary object-cover"
                    />
                  </a>
                ) : (
                  <div
                    aria-hidden
                    className="size-12 shrink-0 rounded-md border border-border-primary bg-bg-tertiary flex items-center justify-center font-mono text-[18px]"
                    style={{ color: PH_ORANGE }}
                  >
                    ▲
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-semibold text-text-primary truncate hover:text-brand transition-colors"
                    >
                      {l.name}
                    </a>
                    <span
                      className="font-mono text-[11px] tabular-nums shrink-0"
                      style={{ color: PH_ORANGE }}
                      aria-label={`${l.votesCount} votes`}
                    >
                      ▲{l.votesCount}
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary shrink-0">
                      {formatAge(l.daysSinceLaunch)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">
                    {l.tagline}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {l.topics.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] text-text-tertiary"
                      >
                        {t}
                      </span>
                    ))}
                    {trackedRepo ? (
                      <Link
                        href={`/repo/${trackedRepo.owner}/${trackedRepo.name}`}
                        className="font-mono text-[10px] text-functional hover:text-functional/80 transition-colors"
                      >
                        View repo on StarScreener →
                      </Link>
                    ) : l.githubUrl ? (
                      <a
                        href={l.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
                      >
                        View on GitHub →
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default RecentLaunches;
