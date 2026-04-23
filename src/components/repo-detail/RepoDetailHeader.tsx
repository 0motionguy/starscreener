// Header card for /repo/[owner]/[name] — mirrors the energy of
// RepoBannerCard at full page width.
//
// Server component: identity (avatar + owner/name link), description,
// language + topic chips, and a single unified "cross-signal strip" that
// combines source badges (HN, Bluesky, dev.to, ProductHunt) + the 5-dot
// ChannelDots indicator + the cross-signal score callout in ONE row.
//
// Why one row: previously the badges + ChannelDots sat on the meta-chip
// line and the score lived in a separate block beneath a divider, which
// visually read as a tab strip + carousel dots — disjointed. Now the
// cross-signal story is told on a single horizontal beat:
//
//   [Y 1] [DEV 1]  ●●○○○  ·  CROSS-SIGNAL  0.80 / 5.0  ·  2/5 channels firing
//
// Quiet sources (count === 0) are omitted entirely; the source-badge
// components already self-hide when their mention is null/zero so we just
// render all four and let them filter themselves out. ChannelDots stays in
// "show full map" mode (hideWhenEmpty=false) so the user always sees the
// 5-channel layout — inactive dots stay outlined for the at-a-glance read.

import type { JSX } from "react";
import { ExternalLink } from "lucide-react";
import type { Repo } from "@/lib/types";
import { ChannelDots } from "@/components/cross-signal/ChannelDots";
import { HnBadge } from "@/components/hackernews/HnBadge";
import { BskyBadge } from "@/components/bluesky/BskyBadge";
import { DevtoBadge } from "@/components/devto/DevtoBadge";
import { PhBadge } from "@/components/producthunt/PhBadge";
import { getHnMentions } from "@/lib/hackernews";
import { getBlueskyMentions } from "@/lib/bluesky";
import { getLaunchForRepo } from "@/lib/producthunt";
import { getRepoMetadata } from "@/lib/repo-metadata";
import type { TwitterRepoRowBadge } from "@/lib/twitter/types";
import { XSignalBadge } from "@/components/twitter/XSignalBadge";

interface RepoDetailHeaderProps {
  repo: Repo;
  twitterBadge?: TwitterRepoRowBadge | null;
}

const MAX_TOPICS = 6;

export function RepoDetailHeader({
  repo,
  twitterBadge = null,
}: RepoDetailHeaderProps): JSX.Element {
  const meta = getRepoMetadata(repo.fullName);
  const hnMention = getHnMentions(repo.fullName);
  const bskyMention = getBlueskyMentions(repo.fullName);
  const phLaunch = getLaunchForRepo(repo.fullName);
  // dev.to is already attached to the Repo upstream via attachCrossSignal.
  const devtoMention = repo.devto ?? null;

  const topics = (repo.topics ?? []).slice(0, MAX_TOPICS);
  const score = repo.crossSignalScore ?? 0;
  const firing = repo.channelsFiring ?? 0;

  return (
    <section
      className="relative overflow-hidden rounded-card border border-border-primary bg-bg-card p-4 sm:p-5 shadow-card"
      // Brand accent stripe so the header reads as the same "card family"
      // as the compare-page banners.
      style={{ borderLeft: "3px solid var(--color-brand)" }}
    >
      {/* Identity row: avatar + owner/name + external link */}
      <div className="flex items-start gap-3 sm:gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={repo.ownerAvatarUrl}
          alt={repo.owner}
          width={56}
          height={56}
          loading="eager"
          className="size-12 sm:size-14 shrink-0 rounded-full border border-border-primary object-cover"
        />
        <div className="flex-1 min-w-0">
          <a
            href={repo.url || `https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${repo.fullName} on GitHub`}
            className="inline-flex items-center gap-1.5 font-display text-xl sm:text-2xl font-semibold text-text-primary hover:text-brand transition-colors max-w-full"
          >
            <span className="truncate">
              {repo.owner}
              <span className="text-text-tertiary">/</span>
              <span className="font-bold">{repo.name}</span>
            </span>
            <ExternalLink size={14} className="shrink-0 text-text-tertiary" aria-hidden />
          </a>

          {/* Description */}
          {repo.description && (
            <p className="mt-1.5 text-sm text-text-secondary leading-snug">
              {repo.description}
            </p>
          )}

          {/* Meta chips: language + license/archived only — source badges
              + ChannelDots have moved into the cross-signal strip below
              so this row stays focused on identity-level metadata. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {repo.language && (
              <span className="inline-flex items-center rounded-md bg-bg-secondary px-2 py-0.5 font-mono text-[11px] text-text-secondary">
                {repo.language}
              </span>
            )}
            {meta?.archived && (
              <span className="inline-flex items-center rounded-md bg-warning/10 text-warning border border-warning/30 px-2 py-0.5 font-mono text-[11px]">
                archived
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Topic pills */}
      {topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {topics.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-md bg-bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="divider-dashed my-4" />

      {/* Unified cross-signal strip — ONE horizontal beat:
            badges (only firing ones render) · ChannelDots (full 5-map) ·
            CROSS-SIGNAL label · score / 5.0 · firing count · rank.
          Wraps gracefully on mobile to 2 lines via flex-wrap.
          Each `·` is a literal text separator inside text-tertiary so it
          aligns with the existing "console" aesthetic of the page. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Source badges + dots group — stays tight via inner gap-1.5
            so visual reads as one chunk even when the row wraps. */}
        <div className="inline-flex flex-wrap items-center gap-1.5">
          <HnBadge mention={hnMention} size="md" />
          <BskyBadge mention={bskyMention} size="md" />
          <DevtoBadge mention={devtoMention} size="md" />
          <PhBadge launch={phLaunch} size="md" />
          <XSignalBadge badge={twitterBadge} />
          <ChannelDots repo={repo} size="md" hideWhenEmpty={false} />
        </div>

        <span className="text-text-tertiary" aria-hidden>·</span>

        {/* Cross-signal score callout — same numbers + tone as before, just
            inline now so the whole story is one line. */}
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          Cross-signal
        </span>
        <span className="font-mono text-2xl font-bold text-text-primary tabular-nums leading-none">
          {score.toFixed(2)}
          <span className="text-base text-text-tertiary"> / 5.0</span>
        </span>

        <span className="text-text-tertiary" aria-hidden>·</span>

        <span className="font-mono text-sm text-text-secondary tabular-nums">
          {firing}/5 channels firing
        </span>

        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {"// rank #"}
          <span className="text-text-secondary tabular-nums">{repo.rank}</span>
        </span>
      </div>
    </section>
  );
}

export default RepoDetailHeader;
