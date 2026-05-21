"use client";

import type { Repo } from "@/lib/types";
import {
  ChartBarIcon,
  LayersIcon,
  RadioIcon,
  StarIcon,
} from "@/components/icons-animated";

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
          <StarIcon size={20} color="var(--accent)" />
        </div>
        <div className="v-title">Watch with smart alerts</div>
        <div className="v-desc">
          Track {repo.fullName} on star surge, mention spike, release, breakout, and funding events.
        </div>
      </div>
      <div className="value-cell">
        <span className="v-tag">PRO</span>
        <div className="v-icon" aria-hidden="true">
          <ChartBarIcon size={20} color="currentColor" />
        </div>
        <div className="v-title">Compare side-by-side</div>
        <div className="v-desc">
          Overlay star curves, {compareMeta}, contributor pace, and funding context.
        </div>
      </div>
      <div className="value-cell">
        <span className="v-tag">PRO</span>
        <div className="v-icon" aria-hidden="true">
          <LayersIcon size={20} color="currentColor" />
        </div>
        <div className="v-title">Full historical view</div>
        <div className="v-desc">
          Current page shows the live 30d desk plus {repoHistoryLabel(repo)} when star activity is cached.
        </div>
      </div>
      <div className="value-cell">
        <span className="v-tag">PRO</span>
        <div className="v-icon" aria-hidden="true">
          <RadioIcon size={20} color="currentColor" />
        </div>
        <div className="v-title">RSS, webhook, API</div>
        <div className="v-desc">
          Pipe this repo signal into your stack with per-repo feeds and outbound triggers.
        </div>
      </div>
    </div>
  );
}
