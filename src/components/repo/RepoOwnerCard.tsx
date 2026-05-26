// RepoOwnerCard — prominent pf-owner card matching the HTML reference's
// owner/maintainer feature surface. Reads from `community.ownerProfile`
// (populated by `fetchRepoCommunityProfileLive` and cached for 24h in
// Redis under `repo-community:{owner}__{name}`). No new fetcher.
//
// Visual role: feature-card in the main body flow, distinct from
// `RepoTeamCard` which is a sidebar-compact variant. This one carries the
// terminal-corner-brackets + stronger typography of the HTML reference.
//
// Empty posture: when the community profile hasn't loaded yet, this
// component returns null and the sidebar `RepoTeamCard` (which has its
// own honest empty state) carries the gap. We never show a half-empty
// hero card.

import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/icon/Icon";
import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { Repo } from "@/lib/types";

interface RepoOwnerCardProps {
  repo: Repo;
  community: RepoCommunityProfile | null;
}

function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function normalizeBlogUrl(blog: string | null | undefined): string | null {
  if (!blog) return null;
  const trimmed = blog.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function RepoOwnerCard({
  repo,
  community,
}: RepoOwnerCardProps): JSX.Element | null {
  const profile = community?.ownerProfile ?? null;
  if (!profile) return null;

  const displayName = profile.name?.trim() || repo.owner;
  const bio = profile.bio?.trim() ?? "";
  const blogUrl = normalizeBlogUrl(profile.blog);
  const twitterHandle = profile.twitterUsername?.trim() ?? null;
  const location = profile.location?.trim() ?? null;
  const avatarSrc = profile.avatarUrl || repo.ownerAvatarUrl;
  const isOrg = profile.type === "Organization";
  const githubUrl = `https://github.com/${repo.owner}`;

  return (
    <section
      className="card pf-card pf-owner"
      aria-labelledby="pf-owner-head"
    >
      <div className="pf-corner pf-corner-tl" aria-hidden="true" />
      <div className="pf-corner pf-corner-tr" aria-hidden="true" />
      <div className="pf-corner pf-corner-bl" aria-hidden="true" />
      <div className="pf-corner pf-corner-br" aria-hidden="true" />

      <header className="pf-owner-head">
        <div className="pf-owner-avatar">
          <Image
            src={avatarSrc}
            alt={`${displayName} avatar`}
            width={96}
            height={96}
            loading="lazy"
            unoptimized
          />
        </div>
        <div className="pf-owner-id">
          <div className="pf-owner-eyebrow mono">
            {isOrg ? (
              <Icon name="users" size={11} />
            ) : (
              <Icon name="user" size={11} />
            )}
            {isOrg ? "ORGANIZATION" : "MAINTAINER"}
          </div>
          <h2 className="pf-owner-name" id="pf-owner-head">
            {displayName}
          </h2>
          <div className="pf-owner-handle">@{repo.owner}</div>
        </div>
        <div className="pf-owner-cta">
          <Link
            href={githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn ghost sm"
          >
            View on GitHub →
          </Link>
        </div>
      </header>

      {bio ? <p className="pf-owner-bio">{bio}</p> : null}

      <dl className="pf-owner-stats">
        <div className="pf-owner-stat">
          <dt className="pf-owner-stat-label mono">FOLLOWERS</dt>
          <dd className="pf-owner-stat-value display">
            {formatCount(profile.followers)}
          </dd>
        </div>
        <div className="pf-owner-stat">
          <dt className="pf-owner-stat-label mono">PUBLIC REPOS</dt>
          <dd className="pf-owner-stat-value display">
            {formatCount(profile.publicRepos)}
          </dd>
        </div>
        {isOrg ? (
          <div className="pf-owner-stat">
            <dt className="pf-owner-stat-label mono">MEMBERS</dt>
            <dd className="pf-owner-stat-value display">
              {profile.membersCount === null
                ? "private"
                : formatCount(profile.membersCount)}
            </dd>
          </div>
        ) : null}
      </dl>

      {(blogUrl || twitterHandle || location) ? (
        <ul className="pf-owner-links">
          {blogUrl ? (
            <li className="pf-owner-link-item">
              <Icon name="globe" size={11} />
              <a
                href={blogUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="pf-owner-link"
              >
                {(() => {
                  try {
                    return new URL(blogUrl).hostname;
                  } catch {
                    return blogUrl;
                  }
                })()}
              </a>
            </li>
          ) : null}
          {twitterHandle ? (
            <li className="pf-owner-link-item">
              <span aria-hidden="true" className="pf-owner-link-icon">𝕏</span>
              <a
                href={`https://twitter.com/${twitterHandle}`}
                target="_blank"
                rel="noreferrer noopener"
                className="pf-owner-link"
              >
                @{twitterHandle}
              </a>
            </li>
          ) : null}
          {location ? (
            <li className="pf-owner-link-item">
              <Icon name="pin" size={11} />
              <span className="pf-owner-link pf-owner-link-static">
                {location}
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
