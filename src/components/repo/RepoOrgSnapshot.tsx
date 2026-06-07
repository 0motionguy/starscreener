// RepoOrgSnapshot — combined "who-built-it + at-a-glance KPIs + org details"
// card. Sits between the hero/intelligence block and the long-form sections.
//
// Renders three regions inside a single .pf-card .pf-combo wrapper:
//   1. pf-combo-top    — avatar, owner display name, bio/description, link pills
//   2. pf-combo-stats  — six KPI cells (Stars, Forks, License, Stack, Contributors, Velocity)
//   3. pf-combo-org    — owner-level KVs (Type, Members/Followers, Repos, Location)
//
// Data: reuses the existing `RepoCommunityProfile.ownerProfile` (name, bio,
// blog, twitterUsername, location, type, followers, publicRepos, membersCount,
// avatarUrl). License + top language come from the community profile. Stars,
// forks, contributors come straight off the Repo row. Star delta uses the
// star-activity payload when present, falling back to the repo's 7d delta.
//
// Returns null only when ALL of (community ownerProfile AND star-activity AND
// repo metadata) are missing — i.e. when there is genuinely nothing to render.
import { ageLabel as _ageLabel } from "@/lib/format-age";
import { Icon } from "@/lib/icons";
import Image from "next/image";

import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { StarActivityPayload } from "@/lib/star-activity-shared";
import type { Repo } from "@/lib/types";
import { formatVelocityPct } from "@/lib/velocity-pct";

// ageLabel is exported here only to keep the import tree obvious; kept
// underscore-prefixed so the linter doesn't flag the unused alias.
void _ageLabel;

interface RepoOrgSnapshotProps {
  repo: Repo;
  community: RepoCommunityProfile | null;
  starActivity: StarActivityPayload | null;
}

function starsLast7Days(payload: StarActivityPayload | null): number | null {
  if (!payload?.points || payload.points.length === 0) return null;
  const tail = payload.points.slice(-7);
  const sum = tail.reduce(
    (acc, p) => acc + (Number.isFinite(p.delta) ? p.delta : 0),
    0,
  );
  if (sum <= 0) return null;
  return sum;
}

function velocityFor(repo: Repo): string {
  const stars =
    typeof repo.stars === "number" && repo.stars > 0 ? repo.stars : 0;
  if (stars > 0) {
    const delta24 = repo.starsDelta24h ?? 0;
    if (delta24 > 0) {
      const p = formatVelocityPct(delta24, stars);
      if (p) return p;
    }
    const delta7 = repo.starsDelta7d ?? 0;
    if (delta7 > 0) {
      const p = formatVelocityPct(delta7, stars);
      if (p) return p;
    }
  }
  if (typeof repo.trendScore24h === "number" && repo.trendScore24h > 0) {
    return `+${repo.trendScore24h.toFixed(1)}%`;
  }
  if (repo.momentumScore && repo.momentumScore > 0) {
    return `+${repo.momentumScore.toFixed(0)}%`;
  }
  return "—";
}

export function RepoOrgSnapshot({
  repo,
  community,
  starActivity,
}: RepoOrgSnapshotProps) {
  const owner = community?.ownerProfile ?? null;

  // Hard null gate: if neither the community profile owner nor the repo row
  // give us anything to render, drop the section entirely.
  if (!owner && !repo.fullName) return null;

  const displayName = owner?.name?.trim() || repo.owner;
  const bio = owner?.bio?.trim() || repo.description?.trim() || null;
  const avatarUrl =
    owner?.avatarUrl ||
    repo.ownerAvatarUrl ||
    `https://github.com/${repo.owner}.png?size=128`;

  const blog = owner?.blog?.trim() || null;
  const twitter = owner?.twitterUsername?.trim() || null;
  const location = owner?.location?.trim() || null;

  const license = community?.license?.spdxId ?? null;
  const topLanguage = community?.languages?.languages?.[0]?.name ?? null;
  const stackValue = topLanguage ?? repo.language ?? null;

  const last7 = starsLast7Days(starActivity);
  const starsSub =
    last7 !== null
      ? `+${last7.toLocaleString()} 7d`
      : repo.starsDelta7d > 0
        ? `+${repo.starsDelta7d.toLocaleString()} 7d`
        : null;

  const forksSub =
    repo.forksDelta7d > 0
      ? `+${repo.forksDelta7d.toLocaleString()} 7d`
      : null;

  const contributorsSub =
    repo.contributorsDelta30d > 0
      ? `+${repo.contributorsDelta30d.toLocaleString()} 30d`
      : null;

  const ownerType = owner?.type === "Organization" ? "Org" : owner ? "User" : "—";
  const membersVal =
    owner?.type === "Organization"
      ? (owner?.membersCount ?? null)
      : (owner?.followers ?? null);
  const membersLabel = owner?.type === "Organization" ? "Members" : "Followers";

  return (
    <section className="pf-card pf-combo">
      <div className="pf-combo-top">
        <Image
          className="pf-combo-logo"
          src={avatarUrl}
          alt={`${repo.owner} avatar`}
          width={44}
          height={44}
          sizes="44px"
        />
        <div className="pf-combo-id">
          <h2 className="pf-combo-name">{displayName}</h2>
          {bio ? <p className="pf-combo-bio">{bio}</p> : null}
          <div className="pf-combo-links">
            {blog ? (
              <a
                className="pf-link-pill"
                href={blog}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="globe" size={10} /> Website
              </a>
            ) : null}
            {twitter ? (
              <a
                className="pf-link-pill"
                href={`https://x.com/${twitter}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="at" size={10} /> @{twitter}
              </a>
            ) : null}
            {location ? (
              <span className="pf-link-pill">
                <Icon name="pin" size={10} /> {location}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="pf-combo-stats">
        <ComboStat lbl="Stars" val={repo.stars.toLocaleString()} delta={starsSub} />
        <ComboStat lbl="Forks" val={repo.forks.toLocaleString()} delta={forksSub} />
        <ComboStat lbl="License" val={license ?? "—"} />
        <ComboStat lbl="Stack" val={stackValue ?? "—"} />
        <ComboStat
          lbl="Contributors"
          val={repo.contributors.toLocaleString()}
          delta={contributorsSub}
        />
        <ComboStat lbl="Velocity" val={velocityFor(repo)} />
      </div>
      <div className="pf-combo-org">
        <KV lbl="Type" val={ownerType} />
        <KV
          lbl={membersLabel}
          val={membersVal !== null ? membersVal.toLocaleString() : "—"}
        />
        <KV
          lbl="Repos"
          val={
            owner?.publicRepos !== null && owner?.publicRepos !== undefined
              ? owner.publicRepos.toLocaleString()
              : "—"
          }
        />
        <KV lbl="Location" val={location ?? "—"} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Private atoms — kept in this file so the plan's pf-combo card stays one
// self-contained unit. Both stay flex-column to inherit token spacing from
// the parent .pf-combo-stats / .pf-combo-org grids.
// ---------------------------------------------------------------------------

interface ComboStatProps {
  lbl: string;
  val: string;
  delta?: string | null;
}

function ComboStat({ lbl, val, delta }: ComboStatProps) {
  return (
    <div className="pf-combo-stat">
      <span className="pf-combo-stat-lbl">{lbl}</span>
      <span className="pf-combo-stat-val">{val}</span>
      {delta ? <span className="pf-combo-stat-delta">{delta}</span> : null}
    </div>
  );
}

interface KVProps {
  lbl: string;
  val: string;
}

function KV({ lbl, val }: KVProps) {
  return (
    <div className="pf-combo-kv">
      <span className="pf-combo-kv-lbl">{lbl}</span>
      <span className="pf-combo-kv-val">{val}</span>
    </div>
  );
}
