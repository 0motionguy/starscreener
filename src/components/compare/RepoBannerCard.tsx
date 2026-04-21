import type { JSX } from "react";
import {
  Star,
  GitFork,
  Eye,
  CircleDot,
  GitMerge,
  Package,
} from "lucide-react";
import type { CompareRepoBundle } from "@/lib/github-compare";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { StatIcon } from "./StatIcon";
import { HnBadge } from "@/components/hackernews/HnBadge";
import { ChannelDots } from "@/components/cross-signal/ChannelDots";
import { getHnMentions } from "@/lib/hackernews";
import { BskyBadge } from "@/components/bluesky/BskyBadge";
import { getBlueskyMentions } from "@/lib/bluesky";
import { PhBadge } from "@/components/producthunt/PhBadge";
import { getLaunchForRepo } from "@/lib/producthunt";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

interface RepoBannerCardProps {
  bundle: CompareRepoBundle;
  /** Series color hex used for the left accent strip. Alias: accentColor. */
  accent?: string;
  accentColor?: string;
}

const MAX_TOPICS = 4;

/**
 * Header card summarising a single repo with identity, meta chips, and a 6-up stats grid.
 */
export function RepoBannerCard({
  bundle,
  accent,
  accentColor,
}: RepoBannerCardProps): JSX.Element {
  const accentStripe = accent ?? accentColor ?? "var(--color-brand)";

  if (!bundle.ok) {
    return (
      <div
        className="relative overflow-hidden rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
        style={{ borderLeft: `3px solid ${accentStripe}` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="size-9 shrink-0 rounded-full bg-bg-secondary" />
          <div className="font-mono text-sm text-text-secondary truncate">
            {bundle.fullName}
          </div>
        </div>
        <p className="text-xs text-text-tertiary">
          Couldn&rsquo;t load — {bundle.error ?? "unknown error"}
        </p>
      </div>
    );
  }

  const latest = bundle.latestRelease;
  const topics = bundle.topics?.slice(0, MAX_TOPICS) ?? [];
  const hnMention = getHnMentions(bundle.fullName);
  const bskyMention = getBlueskyMentions(bundle.fullName);
  const phLaunch = getLaunchForRepo(bundle.fullName);
  // Pull the derived Repo so ChannelDots can compute channel state.
  // null when the repo isn't in the trending corpus — channel dots
  // stay hidden, hnMention badge can still render.
  const derivedRepo = getDerivedRepoByFullName(bundle.fullName);

  return (
    <div
      className="relative overflow-hidden rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
      style={{ borderLeft: `3px solid ${accentStripe}` }}
    >
      {/* Header row: avatar + owner/name + license + language chips */}
      <div className="flex items-start gap-3 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bundle.avatarUrl}
          alt={bundle.owner}
          width={36}
          height={36}
          loading="lazy"
          className="size-9 shrink-0 rounded-full border border-border-primary object-cover"
        />
        <div className="flex-1 min-w-0">
          <a
            href={`https://github.com/${bundle.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-display text-base font-semibold text-text-primary hover:text-brand transition-colors truncate"
            title={bundle.fullName}
          >
            {bundle.owner}
            <span className="text-text-tertiary">/</span>
            {bundle.name}
          </a>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {bundle.language && (
              <span className="inline-flex items-center rounded-md bg-bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                {bundle.language}
              </span>
            )}
            {bundle.license && (
              <span className="inline-flex items-center rounded-md bg-bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
                {bundle.license}
              </span>
            )}
            <HnBadge mention={hnMention} size="md" />
            <BskyBadge mention={bskyMention} size="md" />
            <PhBadge launch={phLaunch} size="md" />
            {derivedRepo && (
              <ChannelDots repo={derivedRepo} hideWhenEmpty size="md" />
            )}
          </div>
        </div>
      </div>

      {/* Description — 2-line clamp */}
      {bundle.description && (
        <p className="text-[12px] text-text-secondary leading-snug mb-2 line-clamp-2">
          {bundle.description}
        </p>
      )}

      {/* Topic pills */}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
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

      <div className="divider-dashed my-3" />

      {/* 6-up stats grid */}
      <div className="grid grid-cols-3 gap-y-3 gap-x-2">
        <StatIcon icon={Star} label="Stars" value={formatNumber(bundle.stars)} />
        <StatIcon
          icon={GitFork}
          label="Forks"
          value={formatNumber(bundle.forks)}
        />
        <StatIcon
          icon={Eye}
          label="Watchers"
          value={formatNumber(bundle.watchers)}
        />
        <StatIcon
          icon={CircleDot}
          label="Open Issues"
          value={formatNumber(bundle.issuesOpen)}
        />
        <StatIcon
          icon={GitMerge}
          label="PRs Merged 30d"
          value={formatNumber(bundle.pullsMergedRecently)}
          tone="up"
        />
        <StatIcon
          icon={Package}
          label={latest ? `Release ${latest.tag}` : "Latest Release"}
          value={latest ? getRelativeTime(latest.publishedAt) : "—"}
          hint={
            latest
              ? `${latest.tag} published ${getRelativeTime(latest.publishedAt)}`
              : "No releases"
          }
        />
      </div>
    </div>
  );
}
