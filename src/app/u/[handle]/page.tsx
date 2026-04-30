// /u/[handle] — V4 (W9) public user profile.
//
// Composes ProfileTemplate (the canonical entity-profile shape) with:
//   - Identity strip (avatar + handle + display name + bio + GH/X links)
//   - VerdictRibbon (single-line activity stamp)
//   - KpiBand (4 cells: reactions given, repos shipped, ideas, member since)
//   - mainPanels: SectionHead "// 01" recent activity, "// 02" top reacted repos
//   - rightRail:  SectionHead "// 03" about, "// 04" links
//
// v1 identity model: handle === authorId from verifyUserAuth. Once a real
// users/handles table lands we'll normalize the incoming handle against it;
// today an unknown handle still renders cleanly via the empty-state ribbon.
// `notFound()` is reserved for handles that fail the loose character regex
// (those can't possibly be valid identifiers).

import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import type { JSX, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { getProfile, type Profile } from "@/lib/profile";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { profileLogoUrl } from "@/lib/logos";
import {
  fetchGithubUserProfile,
  type GithubUserProfile,
} from "@/lib/github-user";
import { formatNumber, getRelativeTime } from "@/lib/utils";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { KpiBand, type KpiCell } from "@/components/ui/KpiBand";
import { PanelHead } from "@/components/ui/PanelHead";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

// ISR with 10-min revalidate. Public profile, no cookies/headers, each
// handle gets its own ISR cache entry. Activity (ideas, reactions) updates
// on the cron cadence — 10 min freshness is plenty for a public profile.
export const revalidate = 600;

// Loose handle validation — same character set as the idea authorHandle
// intake. URLs that don't match this can't be valid identifiers, so they
// 404 outright (per W9 spec).
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

// GitHub login charset is stricter — only consult GitHub for handles that
// could plausibly be a login (alnum + single hyphens, no leading hyphen).
const GH_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;
  if (!HANDLE_PATTERN.test(handle)) {
    return {
      title: `Profile not found — ${SITE_NAME}`,
      description: `No public profile for @${handle}.`,
      robots: { index: false, follow: false },
    };
  }
  const canonical = absoluteUrl(`/u/${handle}`);
  return {
    title: `@${handle} — ${SITE_NAME}`,
    description: `Public profile of @${handle} on ${SITE_NAME}: ideas posted, repos shipped, builder reactions given.`,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      url: canonical,
      title: `@${handle} — ${SITE_NAME}`,
      description: `Public profile of @${handle} on ${SITE_NAME}`,
      siteName: SITE_NAME,
    },
    robots: { index: true, follow: true },
  };
}

export default async function UserProfilePage({
  params,
}: PageProps): Promise<JSX.Element> {
  const { handle } = await params;

  if (!HANDLE_PATTERN.test(handle)) {
    notFound();
  }

  // Pull profile aggregate + GitHub passport in parallel. Both are cheap on
  // warm Lambdas (each has its own ISR/dedupe layer).
  const [profile, ghProfile] = await Promise.all([
    getProfile(handle),
    GH_LOGIN_PATTERN.test(handle)
      ? fetchGithubUserProfile(handle)
      : Promise.resolve(null),
  ]);

  // Per-idea reaction counts (server-rendered so first paint shows real
  // numbers). Same pattern as the legacy ProfileView. Postgres cutover will
  // collapse this to a single GROUP BY.
  const ideaReactionEntries = await Promise.all(
    profile.ideas.map(async (idea) => {
      const records = await listReactionsForObject("idea", idea.id);
      return [idea.id, countReactions(records)] as const;
    }),
  );
  const ideaReactionCounts: Record<string, ReactionCounts> =
    Object.fromEntries(ideaReactionEntries);

  // Top reacted repos: aggregate this user's reactions by objectId where
  // objectType=repo, score by total reaction count, take top 6, hydrate
  // each via the derived-repo lookup so we get real metadata for the
  // RelatedRepoCard. Repos missing from the derived index render with the
  // bare full name only.
  const topRepos = buildTopReactedRepos(profile, 6);
  const lastRefresh = getRelativeTime(new Date().toISOString());

  return (
    <main className="home-surface u-handle-page">
      <ProfileTemplate
        crumb={
          <>
            <b>USER</b> · TERMINAL · /U/{handle.toUpperCase()}
          </>
        }
        identity={
          <UserIdentity
            handle={handle}
            profile={profile}
            ghProfile={ghProfile}
          />
        }
        clock={
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v4-ink-300)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            refreshed {lastRefresh}
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={profile.exists ? "acc" : "amber"}
            stamp={{
              eyebrow: profile.exists ? "// PROFILE" : "// PROFILE · NEW",
              headline: `@${handle}`,
              sub: profile.exists
                ? `${profile.ideas.length} ideas · ${profile.shippedRepos.length} shipped`
                : "no public activity yet",
            }}
            text={
              profile.exists ? (
                <>
                  <b>@{handle}</b> has given{" "}
                  <span style={{ color: "var(--v4-acc)" }}>
                    {profile.reactionsGiven.total} public reaction
                    {profile.reactionsGiven.total === 1 ? "" : "s"}
                  </span>
                  , posted{" "}
                  <span style={{ color: "var(--v4-ink-100)" }}>
                    {profile.ideas.length} idea
                    {profile.ideas.length === 1 ? "" : "s"}
                  </span>
                  , and shipped{" "}
                  <span style={{ color: "var(--v4-money)" }}>
                    {profile.shippedRepos.length} repo
                    {profile.shippedRepos.length === 1 ? "" : "s"}
                  </span>
                  .
                </>
              ) : (
                <>
                  <b>@{handle}</b> hasn&apos;t posted ideas or reacted to repos
                  yet. The profile becomes public on first activity.
                </>
              )
            }
            actionHref={
              ghProfile?.htmlUrl as Route | undefined
            }
            actionLabel={ghProfile ? "GITHUB ↗" : undefined}
          />
        }
        kpiBand={
          <KpiBand cells={buildKpiCells(profile, ghProfile)} />
        }
        mainPanels={
          <>
            <SectionHead
              num="// 01"
              title="Recent activity"
              meta={
                profile.recentReactions.length > 0
                  ? `${profile.recentReactions.length} EVENTS`
                  : undefined
              }
            />
            <RecentActivityFeed
              recent={profile.recentReactions}
            />

            <SectionHead
              num="// 02"
              title="Top reacted repos"
              meta={
                topRepos.length > 0
                  ? `${topRepos.length} REPOS`
                  : undefined
              }
            />
            <TopRepoGrid items={topRepos} />

            {profile.ideas.length > 0 ? (
              <>
                <SectionHead
                  num="// 03"
                  title="Ideas"
                  meta={`${profile.ideas.length} POSTS`}
                />
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {profile.ideas.map((idea) => (
                    <li key={idea.id}>
                      <IdeaCard
                        idea={idea}
                        reactionCounts={
                          ideaReactionCounts[idea.id] ?? {
                            build: 0,
                            use: 0,
                            buy: 0,
                            invest: 0,
                          }
                        }
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        }
        rightRail={
          <>
            <AboutCard handle={handle} ghProfile={ghProfile} />
            <LinksCard handle={handle} ghProfile={ghProfile} />
          </>
        }
      />
    </main>
  );
}

// --- Composition helpers --------------------------------------------------

function UserIdentity({
  handle,
  profile,
  ghProfile,
}: {
  handle: string;
  profile: Profile;
  ghProfile: GithubUserProfile | null;
}): JSX.Element {
  const avatar = ghProfile?.avatarUrl ?? profileLogoUrl(handle, 56);
  const displayName =
    ghProfile?.name && ghProfile.name !== ghProfile.login
      ? ghProfile.name
      : null;
  const bio = ghProfile?.bio ?? null;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        marginTop: 8,
      }}
    >
      {avatar ? (
        <Image
          src={avatar}
          alt={`@${handle}`}
          width={56}
          height={56}
          style={{
            width: 56,
            height: 56,
            borderRadius: 4,
            border: "1px solid var(--v4-line-200)",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 4,
            background: "var(--v4-bg-100)",
            border: "1px solid var(--v4-line-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 24,
            color: "var(--v4-ink-200)",
            flexShrink: 0,
          }}
        >
          {handle.slice(0, 1).toLowerCase()}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          {displayName ? (
            <>
              <span style={{ color: "var(--v4-ink-300)" }}>{displayName}</span>{" "}
              <span style={{ color: "var(--v4-ink-100)" }}>@{handle}</span>
            </>
          ) : (
            <>@{handle}</>
          )}
        </h1>
        {bio ? (
          <p
            className="v4-page-head__lede"
            style={{ marginTop: 0, marginBottom: 10 }}
          >
            {bio}
          </p>
        ) : null}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-300)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {ghProfile?.location ? <span>{ghProfile.location}</span> : null}
          {ghProfile?.publicRepos ? (
            <span>
              <b style={{ color: "var(--v4-ink-100)" }}>
                {formatNumber(ghProfile.publicRepos)}
              </b>{" "}
              repos
            </span>
          ) : null}
          {ghProfile?.followers ? (
            <span>
              <b style={{ color: "var(--v4-ink-100)" }}>
                {formatNumber(ghProfile.followers)}
              </b>{" "}
              followers
            </span>
          ) : null}
          {profile.exists ? (
            <span style={{ color: "var(--v4-money)" }}>● ACTIVE</span>
          ) : (
            <span style={{ color: "var(--v4-ink-400)" }}>○ INACTIVE</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {ghProfile ? (
            <a
              href={ghProfile.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={profileButtonStyle}
            >
              GitHub ↗
            </a>
          ) : null}
          {ghProfile?.twitterUsername ? (
            <a
              href={`https://x.com/${ghProfile.twitterUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              style={profileButtonStyle}
            >
              X / Twitter ↗
            </a>
          ) : null}
          {ghProfile?.blog ? (
            <a
              href={normalizeBlogUrl(ghProfile.blog)}
              target="_blank"
              rel="noopener noreferrer"
              style={profileButtonStyle}
            >
              Website ↗
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const profileButtonStyle = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 11,
  padding: "6px 12px",
  border: "1px solid var(--v4-line-300)",
  borderRadius: 2,
  color: "var(--v4-ink-100)",
  background: "var(--v4-bg-050)",
  textDecoration: "none",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

function buildKpiCells(
  profile: Profile,
  ghProfile: GithubUserProfile | null,
): KpiCell[] {
  const cells: KpiCell[] = [
    {
      label: "Reactions given",
      value: formatNumber(profile.reactionsGiven.total),
      sub: `${profile.reactionsGiven.build} build · ${profile.reactionsGiven.use} use`,
      tone:
        profile.reactionsGiven.total > 0 ? "acc" : "default",
    },
    {
      label: "Repos shipped",
      value: formatNumber(profile.shippedRepos.length),
      sub:
        profile.shippedRepos.length > 0
          ? "with public URL"
          : "none yet",
      tone: profile.shippedRepos.length > 0 ? "money" : "default",
    },
    {
      label: "Ideas posted",
      value: formatNumber(profile.ideas.length),
      sub:
        profile.ideas.length > 0
          ? "published / shipped"
          : "no posts",
    },
    {
      label: "GitHub since",
      value: ghProfile
        ? formatNumber(ghProfile.followers)
        : "—",
      sub: ghProfile ? "followers" : "no GitHub link",
      tone: "default",
    },
  ];
  return cells;
}

function RecentActivityFeed({
  recent,
}: {
  recent: Profile["recentReactions"];
}): JSX.Element {
  if (recent.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-400)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          border: "1px dashed var(--v4-line-200)",
          borderRadius: 2,
          background: "var(--v4-bg-025)",
        }}
      >
        // NO RECENT ACTIVITY
      </div>
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
        background: "var(--v4-bg-025)",
        overflow: "hidden",
      }}
    >
      {recent.slice(0, 20).map((event, idx) => {
        const href: Route =
          event.objectType === "repo"
            ? (`/repo/${event.objectId}` as Route)
            : (`/ideas/${event.objectId}` as Route);
        return (
          <li
            key={`${event.objectType}-${event.objectId}-${event.createdAt}-${idx}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderBottom:
                idx < Math.min(recent.length, 20) - 1
                  ? "1px solid var(--v4-line-100)"
                  : "none",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
            }}
          >
            <span
              style={{
                color: "var(--v4-acc)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                width: 56,
                flexShrink: 0,
              }}
            >
              {event.reactionType}
            </span>
            <span
              style={{
                color: "var(--v4-ink-300)",
                fontSize: 10,
                textTransform: "uppercase",
                width: 40,
                flexShrink: 0,
              }}
            >
              {event.objectType}
            </span>
            <Link
              href={href}
              style={{
                color: "var(--v4-ink-100)",
                textDecoration: "none",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {event.objectId}
            </Link>
            <span
              style={{
                color: "var(--v4-ink-400)",
                fontSize: 10,
                flexShrink: 0,
              }}
            >
              {getRelativeTime(event.createdAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface TopRepoEntry {
  fullName: string;
  count: number;
  repo: Repo | null;
}

function buildTopReactedRepos(profile: Profile, limit: number): TopRepoEntry[] {
  const counts = new Map<string, number>();
  for (const event of profile.recentReactions) {
    if (event.objectType !== "repo") continue;
    counts.set(event.objectId, (counts.get(event.objectId) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  return sorted.map(([fullName, count]) => ({
    fullName,
    count,
    repo: getDerivedRepoByFullName(fullName),
  }));
}

function TopRepoGrid({ items }: { items: TopRepoEntry[] }): JSX.Element {
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-400)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          border: "1px dashed var(--v4-line-200)",
          borderRadius: 2,
          background: "var(--v4-bg-025)",
        }}
      >
        // NO REPO REACTIONS YET
      </div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((item) => {
        const [owner, name] = item.fullName.split("/");
        const href: Route | undefined =
          owner && name
            ? (`/repo/${owner}/${name}` as Route)
            : undefined;
        return (
          <RelatedRepoCard
            key={item.fullName}
            fullName={item.fullName}
            description={item.repo?.description ?? undefined}
            language={
              item.repo?.language
                ? item.repo.language.toUpperCase()
                : undefined
            }
            stars={
              item.repo ? formatNumber(item.repo.stars) : undefined
            }
            similarity={`${item.count}× REACTED`}
            href={href}
          />
        );
      })}
    </div>
  );
}

function AboutCard({
  handle,
  ghProfile,
}: {
  handle: string;
  ghProfile: GithubUserProfile | null;
}): JSX.Element {
  return (
    <RailCard eyebrow="ABOUT" sub={handle.toUpperCase()}>
      {ghProfile?.bio ? (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-geist), Inter, sans-serif",
            fontSize: 12,
            color: "var(--v4-ink-200)",
            lineHeight: 1.5,
          }}
        >
          {ghProfile.bio}
        </p>
      ) : (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-400)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          // NO BIO AVAILABLE
        </p>
      )}
      {ghProfile ? (
        <dl
          style={{
            margin: "12px 0 0",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 12,
            rowGap: 6,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
          }}
        >
          {ghProfile.company ? (
            <>
              <dt style={{ color: "var(--v4-ink-400)" }}>COMPANY</dt>
              <dd
                style={{
                  margin: 0,
                  color: "var(--v4-ink-200)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ghProfile.company}
              </dd>
            </>
          ) : null}
          {ghProfile.location ? (
            <>
              <dt style={{ color: "var(--v4-ink-400)" }}>LOCATION</dt>
              <dd style={{ margin: 0, color: "var(--v4-ink-200)" }}>
                {ghProfile.location}
              </dd>
            </>
          ) : null}
          <dt style={{ color: "var(--v4-ink-400)" }}>TYPE</dt>
          <dd style={{ margin: 0, color: "var(--v4-ink-200)" }}>
            {ghProfile.type === "Organization" ? "ORGANIZATION" : "USER"}
          </dd>
        </dl>
      ) : null}
    </RailCard>
  );
}

function LinksCard({
  handle,
  ghProfile,
}: {
  handle: string;
  ghProfile: GithubUserProfile | null;
}): JSX.Element {
  const links: Array<{ label: string; href: string }> = [];
  if (ghProfile) {
    links.push({ label: "GITHUB", href: ghProfile.htmlUrl });
  } else if (GH_LOGIN_PATTERN.test(handle)) {
    // Speculative — handle could be a GitHub login even if the API call
    // was rate-limited.
    links.push({ label: "GITHUB", href: `https://github.com/${handle}` });
  }
  if (ghProfile?.twitterUsername) {
    links.push({
      label: "X / TWITTER",
      href: `https://x.com/${ghProfile.twitterUsername}`,
    });
  }
  if (ghProfile?.blog) {
    links.push({
      label: "WEBSITE",
      href: normalizeBlogUrl(ghProfile.blog),
    });
  }
  return (
    <RailCard eyebrow="LINKS" sub={`${links.length} EXTERNAL`}>
      {links.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-400)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          // NO PUBLIC LINKS
        </p>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 8px",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-100)",
                  textDecoration: "none",
                  border: "1px solid var(--v4-line-200)",
                  borderRadius: 2,
                  background: "var(--v4-bg-050)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <span>{link.label}</span>
                <span style={{ color: "var(--v4-ink-400)" }}>↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

function RailCard({
  eyebrow,
  sub,
  children,
}: {
  eyebrow: string;
  sub: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <aside
      aria-label={eyebrow.toLowerCase()}
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
        fontFamily: "var(--font-geist-mono), monospace",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
        }}
      >
        <PanelHead k={`// ${eyebrow}`} sub={sub} />
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </aside>
  );
}

function normalizeBlogUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
