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
import { unstable_cache } from "next/cache";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { CATEGORIES } from "@/lib/constants";
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
import { WhyTrendingNarrative } from "@/components/repo-detail/WhyTrendingNarrative";
import { RepoBreadcrumb } from "@/components/repo-detail/RepoBreadcrumb";
import { FundingPanel } from "@/components/repo-detail/FundingPanel";
import { RelatedReposPanel } from "@/components/repo-detail/RelatedReposPanel";
import { PredictionSnapshot } from "@/components/repo-detail/PredictionSnapshot";
import { RelatedIdeasPanel } from "@/components/repo-detail/RelatedIdeasPanel";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

// ISR over force-dynamic: the 12+ refresh hooks above each share the
// data-store's 30s rate-limit + dedupe, so calling them on every request
// costs CPU without buying any freshness. 5-min revalidate keeps repos
// plenty fresh while letting Vercel's edge cache serve repeat hits.
// Each (owner, name) tuple gets its own ISR cache entry on first hit;
// stale-while-revalidate handles long-tail repos cheaply.
export const revalidate = 300;

// All 14 refresh hooks share the data-store's 30s in-process dedupe, so
// the actual Redis traffic per call is tiny — but Next.js was still
// classifying the page as dynamic because of them. Wrapping the whole
// chain in unstable_cache promotes it into Next's managed cache so the
// edge cache can serve repeat hits with public, s-maxage headers.
const cachedRepoRefreshChain = unstable_cache(
  async () => {
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
    return { ok: true };
  },
  ["repo-detail-refresh-chain"],
  { revalidate: 1800, tags: ["repo-data"] },
);

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
      // Layout template appends `— ${SITE_NAME}` automatically — never
      // duplicate it at the page level. (GSC flagged "rtk-ai/rtk —
      // TrendingRepo — TrendingRepo" before this fix; double brand suffix
      // hurts quality signals + indexing.)
      title: "Invalid repo URL",
      description: "Invalid repo URL.",
      robots: { index: false, follow: false },
    };
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  const canonical = absoluteUrl(`/repo/${owner}/${name}`);

  if (!repo) {
    return {
      title: "Repo Not Found",
      description: `We don't have ${owner}/${name} in the momentum terminal yet.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const deltaSign = repo.starsDelta24h >= 0 ? "+" : "";
  // Bare repo name — layout template adds the brand suffix.
  const title = repo.fullName;
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
  // surfaces will read. Wrapped in unstable_cache so Next.js can serve repo
  // pages from Vercel's edge cache instead of force-dynamic on every hit.
  // Live PSI showed this page returning Cache-Control: private,no-cache
  // and TTFB 3.5s despite revalidate=300 — the 14 parallel Redis reads
  // were the dynamic-mode trigger. unstable_cache promotes the whole
  // refresh chain into Next.js's managed cache, with a 30-min TTL keyed on
  // the cache key (shared across repos because each refresh has its own
  // internal in-process dedupe + store-level rate limit).
  await cachedRepoRefreshChain();

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
  // Look up category for breadcrumb schema. Falls back gracefully when
  // categoryId is unrecognised (no breadcrumb middle tier emitted).
  const categoryEntry = repo.categoryId
    ? CATEGORIES.find((c) => c.id === repo.categoryId)
    : null;
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
    categoryId: categoryEntry?.id,
    categoryName: categoryEntry?.name,
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
        {/* Server-rendered breadcrumb — visible Home › Category › Repo
            navigation matches the BreadcrumbList JSON-LD and adds 2-3
            internal links per page (1,700+ sitewide across 839 repos)
            for crawl-budget recovery. */}
        <RepoBreadcrumb
          owner={repo.owner}
          name={repo.name}
          categoryId={repo.categoryId}
        />
        <section className="id-strip">
          <div className="id-avatar">{repo.name.slice(0, 1).toLowerCase()}</div>
          <div className="id-meta">
            <div className="crumb">
              <b>Repo</b>
              <span className="sep">·</span>
              <span>rank #{repo.rank}</span>
              <span className="sep">·</span>
              <span className="firing">{repo.channelsFiring ?? 0}/5 firing</span>
              {repo.language ? (
                <>
                  <span className="sep">·</span>
                  <span>{repo.language}</span>
                </>
              ) : null}
            </div>
            <h1>
              <span className="owner">{repo.owner} /</span> {repo.name}
              <a
                href={repo.url || `https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ext"
                aria-label={`Open ${repo.fullName} on GitHub`}
              >
                ↗
              </a>
            </h1>
            {repo.description ? <p className="desc">{repo.description}</p> : null}
            <div className="row">
              {repo.language ? <span className="lang">{repo.language}</span> : null}
              {(repo.topics ?? []).slice(0, 5).map((topic) => (
                <span key={topic} className="topic">
                  {topic}
                </span>
              ))}
              <span className="stat">
                <span className="lbl">★</span>
                <b>{formatNumber(repo.stars)}</b>
              </span>
              <span className="stat">
                <span className="lbl">⑂</span>
                {formatNumber(repo.forks)}
              </span>
              <span className="stat">
                <span className="lbl">●</span>
                refreshed {lastRefresh}
              </span>
              <FreshnessBadge source="mcp" lastUpdatedAt={profile.fetchedAt} />
            </div>
          </div>
          <div className="id-actions">
            <Link href={`/repo/${repo.owner}/${repo.name}/star-activity`} className="btn">
              Star activity
            </Link>
            <a
              href={repo.url || `https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn gh"
            >
              GitHub ↗
            </a>
          </div>
        </section>

        <section className="repo-verdict">
          <div className="v-rank">
            <span className="lbl">Rank</span>
            <span className="num">#{repo.rank}</span>
            <span className="sub">{repo.language ?? "all repos"}</span>
          </div>
          <div className="v-score">
            <span className="lbl">Cross-signal</span>
            <span>
              <span className="big">{(repo.crossSignalScore ?? 0).toFixed(2)}</span>
              <span className="max"> / 5.0</span>
            </span>
            <div className="gauge" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <i
                  key={index}
                  className={index < (repo.channelsFiring ?? 0) ? "on" : "dim"}
                />
              ))}
            </div>
            <span className="meta">
              <b>{repo.channelsFiring ?? 0} / 5</b> channels firing
            </span>
          </div>
          <p className="v-text">
            <b>{repo.fullName}</b> is ranked by live GitHub momentum and
            cross-source evidence. It moved{" "}
            <span className={repo.starsDelta24h >= 0 ? "hl-money" : "hl-red"}>
              {repo.starsDelta24h >= 0 ? "+" : ""}
              {formatNumber(repo.starsDelta24h)} stars
            </span>{" "}
            in 24h with momentum score{" "}
            <span className="hl">{repo.momentumScore.toFixed(1)}</span>.
          </p>
          <div className="v-spark">
            <span className="lbl">30d stars</span>
            <span className={repo.starsDelta30d >= 0 ? "pct" : "pct dn"}>
              {repo.starsDelta30d >= 0 ? "+" : ""}
              {formatNumber(repo.starsDelta30d)}
            </span>
          </div>
        </section>

        <div className="repo-detail-stack">
          {/* Completeness strip — audit finding #1 trust fix.
              Answers "how much of this profile is actually populated?"
              before the user scrolls through modules that might be empty
              because the pipeline hasn't scanned that source yet vs because
              nothing exists. */}
          {/* <CompletenessStrip> WIP — re-enable once merged from stash. */}
          <RepoActionRow repo={repo} />
          <ObjectReactions
            objectType="repo"
            objectId={repo.fullName}
            initialCounts={initialReactionCounts}
          />
          {/*
            Signal-first layout: "Why Trending" answers the user's first
            question (why should I care?) above the quantitative snapshot.
            Renders null when no reasons are available for this repo.
          */}
          {/* Server-rendered narrative — gives Googlebot 50-90 unique
              words of prose before the chart components hydrate.
              Addresses the "Discovered, not indexed" / thin-content
              quality signal that was capping crawl budget on /repo/X. */}
          <WhyTrendingNarrative repo={repo} profile={profile} />
          <WhyTrending reasons={profile.reasons} />
          <PredictionSnapshot
            prediction={profile.prediction}
            currentStars={repo.stars}
          />
          <RepoSignalSnapshot
            repo={repo}
            mentions={mentions}
            npmPackages={profile.npm.packages}
            productHuntLaunch={profile.productHunt}
          />

          <RepoRevenuePanel
            verified={profile.revenue.verified}
            selfReported={profile.revenue.selfReported}
            trustmrrClaim={profile.revenue.trustmrrClaim}
          />
          <FundingPanel events={profile.funding} />

          <div className="repo-detail-two-col">
            <RepoDetailStatsStrip repo={repo} />
            <RepoDetailStats repo={repo} />
          </div>

          <NpmAdoptionPanel
            packages={profile.npm.packages}
            dailyDownloads={profile.npm.dailyDownloads}
            dependentsByPackage={profile.npm.dependents}
          />

          <div className="repo-detail-split">
            <ProjectSurfaceMap
              repo={repo}
              npmPackages={profile.npm.packages}
              productHuntLaunch={profile.productHunt}
            />
            <CrossSignalBreakdown repo={repo} />
          </div>

          <RecentMentionsFeed
            mentions={mentions}
            freshness={profile.freshness}
            repoFullName={repo.fullName}
            initialCursor={profile.mentions.nextCursor}
          />
          <RelatedReposPanel items={profile.related} />
          <RelatedIdeasPanel items={profile.ideas} />
          <ErrorBoundary>
            <RepoDetailChartLazy repo={repo} markers={markers} />
          </ErrorBoundary>
          <Link
            href={`/repo/${repo.owner}/${repo.name}/star-activity`}
            className="block rounded-card border border-border-primary bg-bg-secondary px-4 py-3 hover:bg-bg-tertiary transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
                  {"// STAR ACTIVITY · FULL HISTORY"}
                </div>
                <div className="text-sm text-text-secondary mt-1">
                  Open the dedicated chart with toggles + share card.
                </div>
              </div>
              <span className="text-text-tertiary font-mono">→</span>
            </div>
          </Link>
          {profile.twitter ? <TwitterSignalPanel panel={profile.twitter} /> : null}
        </div>
      </main>
    </>
  );
}
