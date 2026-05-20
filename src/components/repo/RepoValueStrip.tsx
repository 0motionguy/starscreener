import type { Repo } from "@/lib/types";

interface RepoValueStripProps {
  repo: Repo;
}

function formatBig(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.max(0, Math.round(n)).toLocaleString();
}

function repoHistoryLabel(repo: Repo): string {
  const createdAt = Date.parse(repo.createdAt);
  if (!Number.isFinite(createdAt)) return "30d visible";
  const years = Math.max(1, Math.round((Date.now() - createdAt) / 31_536_000_000));
  return `${years}yr history`;
}

export function RepoValueStrip({ repo }: RepoValueStripProps) {
  const mentionTotal = repo.mentions?.total7d ?? repo.mentionCount24h ?? 0;
  const compareMeta =
    repo.channelsFiring && repo.channelsFiring > 0
      ? `${repo.channelsFiring}/6 source weight`
      : `${formatBig(mentionTotal)} mention signal`;

  return (
    <div className="value-strip">
      <div className="value-cell">
        <span className="v-tag free">FREE</span>
        <div className="v-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2l1.8 4 4.2.4-3.2 2.9.9 4.3L8 11.5l-3.7 2.1.9-4.3L2 6.4l4.2-.4L8 2z" />
          </svg>
        </div>
        <div className="v-title">Watch with smart alerts</div>
        <div className="v-desc">
          Track {repo.fullName} on star surge, mention spike, release, breakout, and funding events.
        </div>
      </div>
      <div className="value-cell">
        <span className="v-tag">PRO</span>
        <div className="v-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8h4l1-3 2 6 1-3h2" />
          </svg>
        </div>
        <div className="v-title">Compare side-by-side</div>
        <div className="v-desc">
          Overlay star curves, {compareMeta}, contributor pace, and funding context.
        </div>
      </div>
      <div className="value-cell">
        <span className="v-tag">PRO</span>
        <div className="v-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 3v10M2 3l5 4 5-4 2 6M2 13l5-4 5 4 2-6" />
          </svg>
        </div>
        <div className="v-title">Full historical view</div>
        <div className="v-desc">
          Current page shows the live 30d desk plus {repoHistoryLabel(repo)} when star activity is cached.
        </div>
      </div>
      <div className="value-cell">
        <span className="v-tag">PRO</span>
        <div className="v-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 11a4 4 0 014 4M3 7a8 8 0 018 8" />
            <circle cx="3" cy="13" r="1.4" fill="currentColor" />
          </svg>
        </div>
        <div className="v-title">RSS, webhook, API</div>
        <div className="v-desc">
          Pipe this repo signal into your stack with per-repo feeds and outbound triggers.
        </div>
      </div>
    </div>
  );
}
