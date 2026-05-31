// RepoHeroCard — 1:1 port of the standalone Profile reference's `PFHero`
// section (see C:/tmp/asset_e0686a47.js lines 369–431). Renders the
// breadcrumb + identity + tags + engage rows for /repo/[owner]/[name].
//
// All data comes from props already collected by the server page. No
// client-side fetches at the section root — interactive slots (heart,
// unicorn, save, compare, share) are isolated client islands.
//
// PF -> live component map for the engage row:
//   PF.heart       -> <RepoLikeButton/>           (optimistic + cooldown)
//   PF.unicorn     -> <RepoReactionButton kind="unicorn"/>
//   PF.bookmark    -> <WatchButton variant="hero"/>   (Save + count)
//   PF.comments    -> <a href="#comments">             (anchor scroll)
//   PF.spacer      -> <span class="spacer"/>            (flex push)
//   PF.compare     -> <RepoCompareButton/>             (tray-aware)
//   PF.bell        -> <Link href="/account?tab=alerts">
//   PF.download    -> <a href="…/brief.csv" download>
//   PF.rss         -> <Link href="…&delivery=rss">
//   PF.arrowUpRight-> <a href=github.url class="pf-react primary">
//
// Data fields consumed:
//   repo.owner / repo.name / repo.fullName / repo.url
//   repo.language / repo.topics / repo.tags / repo.categoryId
//   repo.collectionNames / repo.lastReleaseTag / repo.movementStatus
//   repo.channelsFiring / repo.rank / repo.description
//   repo.ownerAvatarUrl / repo.id / repo.stars
//   likeCount / liked / unicornStatus.{count,active}
//   commentsCount / signedIn / signInUrl
//
// Empty-state behavior:
//   - no description       -> tagline row omitted
//   - no tags resolved     -> tags row omitted
//   - no rank known        -> rank pill omitted (no fake #—)
//   - no language          -> language pill omitted
//   - no avatar URL        -> first letter of name in display font
//   - no watcher baseline  -> Save renders without count, never a fake 0

import Link from "next/link";

import { Icon } from "@/components/icon/Icon";
import { RepoCompareButton } from "@/components/repo/RepoCompareButton";
import { RepoLikeButton } from "@/components/repo/RepoLikeButton";
import { RepoReactionButton } from "@/components/repo/RepoReactionButton";
import { WatchButton } from "@/components/repo/WatchButton";
import type { RepoProfile } from "@/lib/repo-profiles";
import type { RepoReactionStatus } from "@/lib/repo-reactions";
import type { Repo } from "@/lib/types";

interface RepoHeroCardProps {
  repo: Repo;
  profile?: RepoProfile | null;
  /** Server-resolved like-set cardinality at render time. */
  likeCount: number;
  /** Server-resolved `liked` for the current viewer (false when anon). */
  liked: boolean;
  /** Server-resolved unicorn reaction status. */
  unicornStatus: RepoReactionStatus;
  /** Active (non-tombstoned) comment count for the Discuss button. */
  commentsCount: number;
  /** Whether the current viewer has a Clerk session. */
  signedIn: boolean;
  /** Where to send anonymous viewers when they click a gated action. */
  signInUrl: string;
}

function deriveAvatarSeed(name: string): string {
  const clean = (name || "").trim();
  return clean.charAt(0).toUpperCase() || "?";
}

/**
 * Build the hero's tag chip row from real Repo fields.
 *
 * The order mirrors the PF standalone reference: first chip is the most
 * salient category (gets `brand` tint), the rest are supporting facets,
 * then the rank tag is appended (`warn` tint = trending/amber, the
 * closest existing variant to PF's `kind="trend"`).
 *
 * We cap at 6 facet chips + 1 optional rank chip so the row never wraps
 * onto a third line on a 1080-wide hero.
 */
function buildHeroTagFacets(repo: Repo): string[] {
  const raw: Array<string | null | undefined> = [
    ...(repo.tags ?? []),
    ...(repo.topics ?? []),
    repo.language,
    repo.categoryId,
    repo.collectionNames?.[0],
    repo.lastReleaseTag ? "recent release" : null,
    repo.movementStatus ? `${repo.movementStatus} velocity` : null,
    (repo.channelsFiring ?? 0) > 0 ? `${repo.channelsFiring} sources` : null,
  ];

  return Array.from(
    new Set(
      raw
        .filter((tag): tag is string => Boolean(tag))
        .map((tag) => tag.replace(/[_-]/g, " ").toUpperCase()),
    ),
  ).slice(0, 6);
}

export function RepoHeroCard({
  repo,
  likeCount,
  liked,
  unicornStatus,
  commentsCount,
  signedIn,
  signInUrl,
}: RepoHeroCardProps) {
  const tagFacets = buildHeroTagFacets(repo);
  const rankLabel =
    typeof repo.rank === "number" && repo.rank > 0
      ? `TRENDING #${repo.rank}`
      : null;
  const avatarSeed = deriveAvatarSeed(repo.name || repo.owner);
  const avatarUrl = repo.ownerAvatarUrl || null;
  const alertHref = `/account/alerts?repo=${encodeURIComponent(repo.fullName)}`;
  const briefHref = `/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/brief.csv`;
  const rssHref = `${alertHref}&delivery=rss`;
  const githubHref = repo.url || `https://github.com/${repo.fullName}`;
  const formattedComments = commentsCount.toLocaleString("en-US");
  const description = (repo.description ?? "").trim();
  const language = (repo.language ?? "").trim();

  return (
    <section className="pf-card pf-hero">
      <div className="pf-corner-tl" aria-hidden />
      <div className="pf-corner-tr" aria-hidden />
      <div className="pf-corner-bl" aria-hidden />
      <div className="pf-corner-br" aria-hidden />

      {/* PF.crumb row: owner / name / · / public pill / lang pill / github pill */}
      <div className="pf-crumb">
        <span className="owner">{repo.owner}</span>
        <span className="sep">/</span>
        <span className="name">{repo.name}</span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span className="pill" aria-label="Visibility: public">
          public
        </span>
        {language ? (
          <span className="pill" aria-label={`Primary language: ${language}`}>
            <span className="lang-dot tone-0" aria-hidden="true" />
            {language}
          </span>
        ) : null}
        <a
          className="pill"
          href={githubHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${repo.fullName} on GitHub`}
        >
          <Icon name="external" size={11} aria-hidden="true" />
          github.com/{repo.fullName}
        </a>
      </div>

      {/* PF.id row: avatar + title (repo.name, not fullName) + tagline */}
      <div className="pf-hero-row">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar
          <img
            className="pf-avatar"
            src={avatarUrl}
            alt={`${repo.owner} avatar`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="pf-avatar" aria-hidden="true">
            {avatarSeed}
          </div>
        )}

        <div className="pf-hero-meta">
          <h1 className="pf-title" data-repo-hover data-repo={repo.fullName}>
            {repo.name}
          </h1>
          {description ? (
            <p className="pf-tagline">{description}</p>
          ) : null}
          {tagFacets.length > 0 || rankLabel ? (
            <div className="pf-tags">
              {tagFacets.map((tag, index) => (
                <span
                  key={tag}
                  className={`pf-tag${index === 0 ? " brand" : ""}`}
                >
                  {tag}
                </span>
              ))}
              {rankLabel ? (
                <span className="pf-tag warn" aria-label={rankLabel}>
                  {rankLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* PF.engage row: heart + unicorn + save + comments + spacer +
          compare + alert + export + rss + visit. Each interactive control
          is a client island; the surrounding row is server-rendered. */}
      <div className="pf-engage">
        <RepoLikeButton
          repoFullName={repo.fullName}
          initialCount={likeCount}
          initialLiked={liked}
          signedIn={signedIn}
          signInUrl={signInUrl}
        />
        <RepoReactionButton
          repoFullName={repo.fullName}
          kind="unicorn"
          iconName="unicorn"
          variantClass="unicorn"
          activeColorVar="var(--unicorn)"
          initialCount={unicornStatus.count}
          initialActive={unicornStatus.active}
          signedIn={signedIn}
          signInUrl={signInUrl}
          inactiveLabel="Mark as unicorn"
          activeLabel="Remove unicorn"
        />
        <WatchButton
          variant="hero"
          repoId={repo.id}
          fullName={repo.fullName}
          stars={repo.stars}
        />
        <a
          className="pf-react"
          href="#comments"
          aria-label={`Jump to ${formattedComments} comments`}
        >
          <Icon name="messages-square" size={14} className="gly" />
          <span>Comments</span>
          <span className="count">{formattedComments}</span>
        </a>

        <span className="spacer" aria-hidden="true" />

        <RepoCompareButton repoId={repo.id} fullName={repo.fullName} />
        <Link
          className="pf-react"
          href={alertHref}
          prefetch={false}
          title="Configure alerts in your account"
        >
          <Icon name="bell" size={13} className="gly" />
          <span>Set alert</span>
        </Link>
        <a
          className="pf-react"
          href={briefHref}
          download
          title="Export this repo's intelligence as CSV"
        >
          <Icon name="download" size={13} className="gly" />
          <span>Export</span>
        </a>
        <Link
          className="pf-react"
          href={rssHref}
          prefetch={false}
          title="Subscribe via RSS / webhook"
        >
          <Icon name="rss" size={13} className="gly" />
          <span>RSS</span>
        </Link>
        <a
          className="pf-react primary"
          href={githubHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${repo.fullName} on GitHub`}
        >
          <Icon name="arrow-up-right" size={13} className="gly" />
          <span>Visit repo</span>
        </a>
      </div>
    </section>
  );
}
