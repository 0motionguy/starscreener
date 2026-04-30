// /repo/[owner]/[name] — modernized repo detail page.
//
// Mostly a server component that composes:
//   1. RepoDetailHeader  — identity + badges + cross-signal score callout
//   2. RepoActionRow     — Watch / Compare / open on GitHub (client)
//   3. RepoSignalSnapshot — compact intelligence metrics
//   4. ProjectSurfaceMap / CrossSignalBreakdown — entity + signal surfaces
//   5. RecentMentionsFeed — full evidence feed above diagnostics
//   6. RepoDetailChart — compact trend with cross-channel mention dots
//
// Replaces the old detail/* component set in spirit; the legacy components
// remain on disk under src/components/detail/ but are no longer wired in.
//
// Every signal this page renders is sourced from the canonical profile
// assembler (`buildCanonicalRepoProfile`). Adding a new signal means
// exposing it on `CanonicalRepoProfile` once, and consuming the slice
// here — this page no longer stitches per-source loaders directly.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { absoluteUrl, SITE_NAME, safeJsonLd } from "@/lib/seo";
import { buildRepoPageSchemas } from "@/lib/seo-repo-schemas";
import { buildCanonicalRepoProfile } from "@/lib/api/repo-profile";
// Data-store refresh hooks. The repo detail page consumes signal data from
// many sources; we refresh all of them in parallel before the canonical
// assembler runs so the post-refresh getters see the freshest cache.
// Each refresh has internal 30s rate-limit + in-flight dedupe — calling
// them on every render is cheap on warm Lambdas.
//   Group A (discovery / GH metadata)
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import { refreshNpmFromStore } from "@/lib/npm";
//   Group B (social mentions + per-source trending)
import { refreshRedditMentionsFromStore } from "@/lib/reddit-data";
import { refreshRedditAllPostsFromStore } from "@/lib/reddit-all-data";
import { refreshRedditBaselinesFromStore } from "@/lib/reddit-baselines";
import { refreshHackernewsMentionsFromStore } from "@/lib/hackernews";
import { refreshHackernewsTrendingFromStore } from "@/lib/hackernews-trending";
import { refreshBlueskyMentionsFromStore } from "@/lib/bluesky";
import { refreshBlueskyTrendingFromStore } from "@/lib/bluesky-trending";
import { refreshDevtoMentionsFromStore } from "@/lib/devto";
import { refreshDevtoTrendingFromStore } from "@/lib/devto-trending";
import { refreshLobstersMentionsFromStore } from "@/lib/lobsters";
import { refreshLobstersTrendingFromStore } from "@/lib/lobsters-trending";
import { refreshProducthuntLaunchesFromStore } from "@/lib/producthunt";
// Group C (funding + profiles + revenue) is refreshed inside
// buildCanonicalRepoProfile() — no need to re-call here.

import { RepoDetailStats } from "@/components/repo-detail/RepoDetailStats";
import { RepoDetailStatsStrip } from "@/components/repo-detail/RepoDetailStatsStrip";
import { RepoDetailChartLazy } from "@/components/repo-detail/RepoDetailChartLazy";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { buildMentionMarkers } from "@/components/repo-detail/MentionMarkers";
import { CrossSignalBreakdown } from "@/components/repo-detail/CrossSignalBreakdown";
import { RecentMentionsFeed } from "@/components/repo-detail/RecentMentionsFeed";
import { MaintainerCard } from "@/components/repo-detail/MaintainerCard";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";
import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { KpiBand } from "@/components/ui/KpiBand";
import { GaugeStrip } from "@/components/ui/GaugeStrip";
import { getChannelStatus } from "@/lib/pipeline/cross-signal";
// CompletenessStrip is a work-in-progress component parked in a local
// stash; re-import once it lands on main and CanonicalRepoProfile
// exposes the `completeness` field.
import { toMentionItem } from "@/components/repo-detail/MentionMeta";
import type { MentionItem } from "@/components/repo-detail/MentionMeta";
import { RepoSignalSnapshot } from "@/components/repo-detail/RepoSignalSnapshot";
import { ProjectSurfaceMap } from "@/components/repo-detail/ProjectSurfaceMap";
import { NpmAdoptionPanel } from "@/components/repo-detail/NpmAdoptionPanel";
import { RepoActionRow } from "@/components/repo-detail/RepoActionRow";
import { ObjectReactions } from "@/components/reactions/ObjectReactions";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import { TwitterSignalPanel } from "@/components/twitter/TwitterSignalPanel";
import { RepoRevenuePanel } from "@/components/repo-detail/RepoRevenuePanel";
import { WhyTrending } from "@/components/repo-detail/WhyTrending";
import { FundingPanel } from "@/components/repo-detail/FundingPanel";
import { PredictionSnapshot } from "@/components/repo-detail/PredictionSnapshot";
import { RelatedIdeasPanel } from "@/components/repo-detail/RelatedIdeasPanel";

// ISR over force-dynamic: the 12+ refresh hooks above each share the
// data-store's 30s rate-limit + dedupe, so calling them on every request
// costs CPU without buying any freshness. 5-min revalidate keeps repos
// plenty fresh while letting Vercel's edge cache serve repeat hits.
// Each (owner, name) tuple gets its own ISR cache entry on first hit;
// stale-while-revalidate handles long-tail repos cheaply.
export const revalidate = 300;

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return {
      title: `Invalid repo URL — ${SITE_NAME}`,
      description: "Invalid repo URL.",
      robots: { index: false, follow: false },
    };
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  const canonical = absoluteUrl(`/repo/${owner}/${name}`);

  if (!repo) {
    return {
      title: `Repo Not Found — ${SITE_NAME}`,
      description: `We don't have ${owner}/${name} in the momentum terminal yet.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const deltaSign = repo.starsDelta24h >= 0 ? "+" : "";
  const title = `${repo.fullName} — ${SITE_NAME}`;
  const description =
    repo.description?.trim() ||
    `${repo.fullName}: ${deltaSign}${repo.starsDelta24h.toLocaleString(
      "en-US",
    )} stars in 24h · momentum ${repo.momentumScore.toFixed(
      1,
    )}. Track this repo on ${SITE_NAME}.`;

  return {
    title,
    description,
    keywords: [
      repo.fullName,
      repo.owner,
      repo.name,
      ...(repo.language ? [repo.language] : []),
      ...(repo.topics ?? []).slice(0, 8),
      "GitHub trending",
      "repo momentum",
      SITE_NAME,
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RepoDetailPage({ params }: PageProps) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    notFound();
  }

  // Existence check short-circuits before any heavier assembly work. The
  // canonical assembler also runs this check but calling it here keeps the
  // 404 path on the metadata loader symmetrical with the page loader.
  const baseRepo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!baseRepo) {
    notFound();
  }

  // Refresh every data-store-backed cache the canonical profile + render
  // surfaces will read. All in parallel; each is cheap on warm Lambdas.
  await Promise.all([
    refreshRepoMetadataFromStore(),
    refreshNpmFromStore(),
    refreshRedditMentionsFromStore(),
    refreshRedditAllPostsFromStore(),
    refreshRedditBaselinesFromStore(),
    refreshHackernewsMentionsFromStore(),
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyMentionsFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoMentionsFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshLobstersMentionsFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshProducthuntLaunchesFromStore(),
  ]);

  // Single canonical call replaces the fifteen-loader stitch that used to
  // live here. Every surface consumes a slice of `profile`, so any future
  // signal migration only has to touch `buildCanonicalRepoProfile`.
  const profile = await buildCanonicalRepoProfile(baseRepo.fullName);
  if (!profile) {
    notFound();
  }
  const { repo } = profile;

  // Flatten the persisted store slice into the render shape the feed +
  // signal cards consume. Platforms that aren't surfaced by MentionItem
  // (e.g. GitHub events) fall through `toMentionItem`'s null return.
  const mentions: MentionItem[] = profile.mentions.recent
    .map(toMentionItem)
    .filter((item): item is MentionItem => item !== null);

  // Server-render the reaction counts so the strip below the action row
  // shows real numbers on first paint instead of zeros + a spinner. The
  // client component still re-fetches if a user takes any action.
  const initialReactionCounts = countReactions(
    await listReactionsForObject("repo", repo.fullName),
  );
  // Cross-channel marker dots for the Stars chart — pre-built server-side
  // so the client RepoDetailChart bundle stays free of every per-source
  // mentions JSON. Kept as a direct call because this is pure rendering
  // data that doesn't need to live on the canonical profile.
  const markers = buildMentionMarkers(repo.fullName, 30);
  const lastRefresh = getRelativeTime(new Date().toISOString());

  // JSON-LD entity graph for the repo page. Replaces the previous hand-rolled
  // SoftwareSourceCode + BreadcrumbList pair with a richer set:
  //   SoftwareSourceCode, SoftwareApplication, BreadcrumbList,
  //   and (when momentum + stars are present) AggregateRating.
  // All schemas are anchored to the global Organization (#organization) and
  // Website (#website) entities defined on the homepage.
  const jsonLdSchemas = buildRepoPageSchemas({
    owner: repo.owner,
    name: repo.name,
    description: repo.description,
    language: repo.language,
    topics: repo.topics,
    stars: repo.stars,
    forks: repo.forks,
    lastCommitAt: repo.lastCommitAt,
    createdAt: repo.createdAt,
    momentumScore: repo.momentumScore,
  });

  return (
    <>
      {jsonLdSchemas.map((schema, idx) => (
        <script
          // Index-based key is fine: the array length only varies based on
          // whether AggregateRating is appended (deterministic per render).
          key={`repo-jsonld-${idx}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
        />
      ))}

      <main className="home-surface repo-detail-page">
        <ProfileTemplate
          crumb={
            <>
              <b>REPO</b> · TERMINAL · /{repo.fullName.toUpperCase()}
            </>
          }
          identity={
            <RepoIdentity repo={repo} lastRefresh={lastRefresh} />
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
              tone="acc"
              stamp={{
                eyebrow: "// VERDICT",
                headline: `#${repo.rank} in ${repo.language ?? "all repos"}`,
                sub: `${(repo.crossSignalScore ?? 0).toFixed(2)} / 5.0 · ${
                  repo.channelsFiring ?? 0
                }/5 channels firing`,
              }}
              text={
                <>
                  <b>{repo.fullName}</b> is ranked by live GitHub momentum and
                  cross-source evidence. It moved{" "}
                  <span
                    style={{
                      color:
                        repo.starsDelta24h >= 0
                          ? "var(--v4-money)"
                          : "var(--v4-red)",
                    }}
                  >
                    {repo.starsDelta24h >= 0 ? "+" : ""}
                    {formatNumber(repo.starsDelta24h)} stars
                  </span>{" "}
                  in 24h with momentum score{" "}
                  <span style={{ color: "var(--v4-acc)" }}>
                    {repo.momentumScore.toFixed(1)}
                  </span>
                  .
                </>
              }
              actionHref={`/repo/${repo.owner}/${repo.name}/star-activity`}
              actionLabel="STAR ACTIVITY →"
            />
          }
          kpiBand={
            <KpiBand cells={buildKpiCells(repo, profile)} />
          }
          signalStrip={<RepoChannelStrip repo={repo} />}
          mainPanels={
            <>
              <RepoActionRow repo={repo} />
              <ObjectReactions
                objectType="repo"
                objectId={repo.fullName}
                initialCounts={initialReactionCounts}
              />

              {profile.reasons.length > 0 ? (
                <>
                  <SectionHead num="// 01" title="Why trending" />
                  <WhyTrending reasons={profile.reasons} />
                </>
              ) : null}

              {profile.prediction ? (
                <>
                  <SectionHead num="// 02" title="Prediction" meta="+30D HORIZON" />
                  <PredictionSnapshot
                    prediction={profile.prediction}
                    currentStars={repo.stars}
                  />
                </>
              ) : null}

              <SectionHead num="// 03" title="Signal snapshot" />
              <RepoSignalSnapshot
                repo={repo}
                mentions={mentions}
                npmPackages={profile.npm.packages}
                productHuntLaunch={profile.productHunt}
              />

              {hasRevenueData(profile) ? (
                <>
                  <SectionHead num="// 04" title="Revenue" />
                  <RepoRevenuePanel
                    verified={profile.revenue.verified}
                    selfReported={profile.revenue.selfReported}
                    trustmrrClaim={profile.revenue.trustmrrClaim}
                  />
                </>
              ) : null}

              {profile.funding.length > 0 ? (
                <>
                  <SectionHead
                    num="// 05"
                    title="Funding"
                    meta={`${profile.funding.length} EVENTS`}
                  />
                  <FundingPanel events={profile.funding} />
                </>
              ) : null}

              <SectionHead num="// 06" title="Stats" />
              <div className="repo-detail-two-col">
                <RepoDetailStatsStrip repo={repo} />
                <RepoDetailStats repo={repo} />
              </div>

              {profile.npm.packages.length > 0 ? (
                <>
                  <SectionHead
                    num="// 07"
                    title="npm adoption"
                    meta={`${profile.npm.packages.length} PACKAGES`}
                  />
                  <NpmAdoptionPanel
                    packages={profile.npm.packages}
                    dailyDownloads={profile.npm.dailyDownloads}
                    dependentsByPackage={profile.npm.dependents}
                  />
                </>
              ) : null}

              <SectionHead num="// 08" title="Cross-signal breakdown" />
              <CrossSignalBreakdown repo={repo} />

              <SectionHead num="// 09" title="Star history" meta="90D CUMULATIVE" />
              <ErrorBoundary>
                <RepoDetailChartLazy repo={repo} markers={markers} />
              </ErrorBoundary>

              <SectionHead
                num="// 10"
                title="Mentions evidence"
                meta={`${mentions.length} MENTIONS`}
              />
              <RecentMentionsFeed
                mentions={mentions}
                freshness={profile.freshness}
                repoFullName={repo.fullName}
                initialCursor={profile.mentions.nextCursor}
              />

              {profile.ideas.length > 0 ? (
                <>
                  <SectionHead
                    num="// 11"
                    title="Related ideas"
                    meta={`${profile.ideas.length} IDEAS`}
                  />
                  <RelatedIdeasPanel items={profile.ideas} />
                </>
              ) : null}

              {profile.twitter ? (
                <>
                  <SectionHead num="// 12" title="Twitter signal" />
                  <TwitterSignalPanel panel={profile.twitter} />
                </>
              ) : null}
            </>
          }
          rightRail={
            <>
              <ProjectSurfaceMap
                repo={repo}
                npmPackages={profile.npm.packages}
                productHuntLaunch={profile.productHunt}
              />
              <MaintainerCard
                owner={repo.owner}
                fallbackAvatarUrl={repo.ownerAvatarUrl}
              />
            </>
          }
          relatedEyebrow={`RELATED REPOS · ${profile.related.length}`}
          related={
            profile.related.length > 0
              ? profile.related.map((item) => {
                  const [itemOwner, itemName] = item.fullName.split("/");
                  const href =
                    itemOwner && itemName
                      ? `/repo/${itemOwner}/${itemName}`
                      : undefined;
                  return (
                    <RelatedRepoCard
                      key={item.fullName}
                      fullName={item.fullName}
                      description={item.description ?? undefined}
                      language={
                        item.language ? item.language.toUpperCase() : undefined
                      }
                      stars={formatNumber(item.stars)}
                      similarity={
                        item.relation
                          ? item.relation.toUpperCase()
                          : undefined
                      }
                      href={href}
                    />
                  );
                })
              : null
          }
        />
      </main>
    </>
  );
}

// --- Composition helpers --------------------------------------------------

function RepoIdentity({
  repo,
  lastRefresh,
}: {
  repo: import("@/lib/types").Repo;
  lastRefresh: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        marginTop: 8,
      }}
    >
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
        {repo.name.slice(0, 1).toLowerCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          <span style={{ color: "var(--v4-ink-300)" }}>{repo.owner} /</span>{" "}
          {repo.name}{" "}
          <a
            href={repo.url || `https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${repo.fullName} on GitHub`}
            style={{
              color: "var(--v4-ink-300)",
              textDecoration: "none",
              fontSize: "0.7em",
              verticalAlign: "middle",
            }}
          >
            ↗
          </a>
        </h1>
        {repo.description ? (
          <p
            className="v4-page-head__lede"
            style={{ marginTop: 0, marginBottom: 10 }}
          >
            {repo.description}
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
          {repo.language ? <span>{repo.language}</span> : null}
          {(repo.topics ?? []).slice(0, 5).map((topic) => (
            <span
              key={topic}
              style={{
                padding: "1px 6px",
                border: "1px solid var(--v4-line-200)",
                borderRadius: 2,
                color: "var(--v4-ink-300)",
              }}
            >
              {topic}
            </span>
          ))}
          <span>
            ★ <b style={{ color: "var(--v4-ink-100)" }}>{formatNumber(repo.stars)}</b>
          </span>
          <span>
            ⑂{" "}
            <b style={{ color: "var(--v4-ink-100)" }}>
              {formatNumber(repo.forks)}
            </b>
          </span>
          <span style={{ color: "var(--v4-money)" }}>● {lastRefresh}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Link
            href={`/repo/${repo.owner}/${repo.name}/star-activity`}
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              padding: "6px 12px",
              border: "1px solid var(--v4-line-300)",
              borderRadius: 2,
              color: "var(--v4-ink-100)",
              background: "var(--v4-bg-050)",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Star activity
          </Link>
          <a
            href={repo.url || `https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              padding: "6px 12px",
              border: "1px solid var(--v4-line-300)",
              borderRadius: 2,
              color: "var(--v4-ink-100)",
              background: "var(--v4-bg-050)",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function RepoChannelStrip({ repo }: { repo: import("@/lib/types").Repo }) {
  const status = getChannelStatus(repo);
  const channels = [
    { key: "gh", label: "GitHub", on: status.github },
    { key: "hn", label: "HN", on: status.hn },
    { key: "reddit", label: "Reddit", on: status.reddit },
    { key: "bsky", label: "Bluesky", on: status.bluesky },
    { key: "dev", label: "Dev.to", on: status.devto },
  ] as const;

  const cellWidth = 96;
  const gap = 8;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: "fit-content",
      }}
    >
      <div style={{ display: "flex", gap }}>
        {channels.map((c) => (
          <div
            key={c.key}
            style={{
              width: cellWidth,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v4-ink-300)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "flex",
              justifyContent: "space-between",
              gap: 4,
            }}
          >
            <span>{c.label}</span>
            <span
              style={{
                color: c.on ? "var(--v4-money)" : "var(--v4-ink-400)",
              }}
            >
              {c.on ? "firing" : "cold"}
            </span>
          </div>
        ))}
      </div>
      <GaugeStrip
        cells={channels.map((c) => ({
          state: c.on ? "on" : "off",
          title: `${c.label}: ${c.on ? "firing" : "cold"}`,
        }))}
        cellWidth={cellWidth}
        cellHeight={6}
        gap={gap}
      />
    </div>
  );
}

function buildKpiCells(
  repo: import("@/lib/types").Repo,
  profile: NonNullable<
    Awaited<ReturnType<typeof buildCanonicalRepoProfile>>
  >,
): import("@/components/ui/KpiBand").KpiCell[] {
  const surfaces = countSurfaces(profile);
  const starDelta = repo.starsDelta24h;
  const contribDelta = repo.contributorsDelta30dMissing
    ? null
    : repo.contributorsDelta30d;

  return [
    {
      label: "Stars",
      value: formatNumber(repo.stars),
      delta:
        starDelta !== 0
          ? `${starDelta > 0 ? "+" : ""}${formatNumber(starDelta)}`
          : undefined,
      sub: "24h",
      tone: starDelta > 0 ? "money" : starDelta < 0 ? "red" : "default",
    },
    {
      label: "Forks",
      value: formatNumber(repo.forks),
      sub: "all-time",
    },
    {
      label: "Contribs",
      value: formatNumber(repo.contributors),
      delta:
        contribDelta !== null && contribDelta !== 0
          ? `${contribDelta > 0 ? "+" : ""}${formatNumber(contribDelta)}`
          : undefined,
      sub: contribDelta !== null ? "30d" : "all-time",
    },
    {
      label: "Momentum",
      value: repo.momentumScore.toFixed(1),
      sub: "0-100 scale",
      tone: repo.momentumScore >= 60 ? "money" : "default",
    },
    {
      label: "Surface",
      value: `${surfaces.found} / ${surfaces.total}`,
      sub: surfaces.summary,
    },
  ];
}

function countSurfaces(
  profile: NonNullable<
    Awaited<ReturnType<typeof buildCanonicalRepoProfile>>
  >,
): { found: number; total: number; summary: string } {
  const present: string[] = [];
  // GitHub: always present (repo exists by definition)
  present.push("github");
  if (profile.npm.packages.length > 0) present.push("npm");
  if (profile.productHunt) present.push("ph");
  if (profile.funding.length > 0) present.push("funding");
  if (profile.revenue.verified || profile.revenue.selfReported) {
    present.push("revenue");
  }
  if (profile.twitter) present.push("twitter");
  return {
    found: present.length,
    total: 6,
    summary: present.join(" · "),
  };
}

function hasRevenueData(
  profile: NonNullable<
    Awaited<ReturnType<typeof buildCanonicalRepoProfile>>
  >,
): boolean {
  return Boolean(
    profile.revenue.verified ||
      profile.revenue.selfReported ||
      profile.revenue.trustmrrClaim,
  );
}
