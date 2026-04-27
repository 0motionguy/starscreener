// V2 header for /repo/[owner]/[name] — Node/01 instrument-panel chrome.
//
// Server component. Identity (avatar + owner/name link) on a v2-card with
// terminal-bar header chrome, V2 hairline ink ramp, mono operator labels,
// .v2-bracket markers on the cross-signal score (the "focused object" of
// this page), and unified cross-signal strip carried forward.

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
import { TerminalBar, BracketMarkers } from "@/components/v2";

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
  const devtoMention = repo.devto ?? null;

  const topics = (repo.topics ?? []).slice(0, MAX_TOPICS);
  const score = repo.crossSignalScore ?? 0;
  const firing = repo.channelsFiring ?? 0;

  const hnCount = hnMention?.count7d ?? 0;
  const hnFrontPage = hnMention?.everHitFrontPage ?? false;
  const bskyCount = bskyMention?.count7d ?? 0;
  const redditCount = repo.reddit?.mentions7d ?? 0;
  const devtoCount = devtoMention?.mentions7d ?? 0;
  const channelTooltips = {
    github: `GitHub momentum: ${repo.movementStatus ?? "stable"} (score ${repo.momentumScore.toFixed(1)} / 100)`,
    reddit:
      redditCount > 0
        ? `Reddit: ${redditCount} mention${redditCount === 1 ? "" : "s"} in 7d`
        : "Reddit: no posts in last 7d",
    hn:
      hnCount > 0
        ? `HackerNews: ${hnCount} mention${hnCount === 1 ? "" : "s"} in 7d${hnFrontPage ? " (front-page hit)" : ""}`
        : "HackerNews: no mentions in last 7d",
    bluesky:
      bskyCount > 0
        ? `Bluesky: ${bskyCount} mention${bskyCount === 1 ? "" : "s"} in 7d`
        : "Bluesky: no mentions in last 7d",
    devto:
      devtoCount > 0
        ? `dev.to: ${devtoCount} article${devtoCount === 1 ? "" : "s"} in 7d`
        : "dev.to: no articles in last 7d",
  };

  const crossSignalTooltip =
    "Cross-signal score (0-5): weighted sum of GitHub + Reddit + HN + Bluesky + dev.to components, each 0-1. 5.0 = strong signal across >=4 channels in 7d. 4.0 = strong on >=3. 3.0 = strong on >=2. 2.0+ = active on 1+. Below 1.0 = low or no cross-channel activity.";

  // Score buckets to drive accent color on the focused stat.
  const scoreTone =
    score >= 4 ? "var(--v2-acc)" :
    score >= 3 ? "var(--v2-sig-amber)" :
    score >= 2 ? "var(--v2-ink-100)" :
    "var(--v2-ink-300)";

  return (
    <section className="v2-card overflow-hidden">
      <TerminalBar
        label={`// REPO · ${repo.fullName.toUpperCase()}`}
        status={
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums">RANK #{repo.rank}</span>
            <span style={{ color: "var(--v2-line-300)" }}>·</span>
            <span style={{ color: scoreTone }}>
              {firing}/5 FIRING
            </span>
          </span>
        }
        live={firing >= 2}
      />

      <div className="p-4 sm:p-5 space-y-4">
        {/* Identity row */}
        <div className="flex items-start gap-3 sm:gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={repo.ownerAvatarUrl}
            alt={repo.owner}
            width={56}
            height={56}
            loading="eager"
            className="size-12 sm:size-14 shrink-0 object-cover"
            style={{
              borderRadius: 2,
              border: "1px solid var(--v2-line-200)",
            }}
          />
          <div className="flex-1 min-w-0">
            <h1
              className="m-0 leading-tight truncate"
              style={{
                fontFamily: "var(--font-geist), Inter, sans-serif",
                fontSize: "clamp(20px, 3vw, 28px)",
                fontWeight: 510,
                letterSpacing: "-0.022em",
                color: "var(--v2-ink-000)",
              }}
            >
              <a
                href={repo.url || `https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${repo.fullName} on GitHub`}
                className="inline-flex items-center gap-1.5 max-w-full transition-colors"
                style={{ color: "var(--v2-ink-000)" }}
              >
                <span className="truncate">
                  <span style={{ color: "var(--v2-ink-300)" }}>
                    {repo.owner}
                    <span style={{ color: "var(--v2-ink-400)" }}>/</span>
                  </span>
                  <span style={{ color: "var(--v2-acc)" }}>{repo.name}</span>
                </span>
                <ExternalLink
                  size={14}
                  className="shrink-0"
                  style={{ color: "var(--v2-ink-400)" }}
                  aria-hidden
                />
              </a>
            </h1>

            {repo.description && (
              <p
                className="mt-2 leading-snug"
                style={{
                  color: "var(--v2-ink-200)",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {repo.description}
              </p>
            )}

            {/* Meta tags: language + archived */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {repo.language && (
                <span className="v2-tag">{repo.language}</span>
              )}
              {meta?.archived && (
                <span
                  className="v2-tag"
                  style={{
                    color: "var(--v2-sig-amber)",
                    borderColor: "var(--v2-sig-amber)",
                  }}
                >
                  ARCHIVED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Topic pills */}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topics.map((t) => (
              <span
                key={t}
                className="v2-tag"
                style={{ color: "var(--v2-ink-300)" }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* V2 hairline divider */}
        <div
          aria-hidden
          style={{
            height: 1,
            background: "var(--v2-line-std)",
          }}
        />

        {/* Cross-signal strip — single horizontal beat with .v2-bracket on the
            focused score (the page's "focused object" per Sentinel discipline) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="inline-flex flex-wrap items-center gap-1.5">
            <HnBadge mention={hnMention} size="md" />
            <BskyBadge mention={bskyMention} size="md" />
            <DevtoBadge mention={devtoMention} size="md" />
            <PhBadge launch={phLaunch} size="md" />
            <XSignalBadge badge={twitterBadge} />
            <ChannelDots
              repo={repo}
              size="md"
              hideWhenEmpty={false}
              tooltips={channelTooltips}
            />
          </div>

          <span
            aria-hidden
            style={{ color: "var(--v2-line-300)" }}
          >
            ·
          </span>

          <span
            className="v2-mono text-[10px]"
            style={{ color: "var(--v2-ink-400)" }}
          >
            {"// CROSS-SIGNAL"}
          </span>

          {/* Focused stat — bracket-marked */}
          <BracketMarkers active={firing >= 2} size={6} inset={-2}>
            <span
              className="v2-stat tabular-nums leading-none px-1"
              style={{
                fontSize: "clamp(20px, 2.6vw, 28px)",
                fontWeight: 510,
                color: scoreTone,
              }}
              title={crossSignalTooltip}
            >
              {score.toFixed(2)}
              <span
                style={{
                  fontSize: "0.55em",
                  color: "var(--v2-ink-400)",
                  marginLeft: 4,
                }}
              >
                / 5.0
              </span>
            </span>
          </BracketMarkers>

          <span
            aria-hidden
            style={{ color: "var(--v2-line-300)" }}
          >
            ·
          </span>

          <span
            className="v2-mono-tight tabular-nums"
            style={{
              fontSize: 11,
              color: "var(--v2-ink-300)",
            }}
            title="Number of channels with a non-zero component in the last 7 days."
          >
            {firing}/5 CHANNELS FIRING
          </span>
        </div>
      </div>
    </section>
  );
}

export default RepoDetailHeader;
