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
import { Flame, TrendingUp, Zap } from "lucide-react";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildCanonicalRepoProfile } from "@/lib/api/repo-profile";

import { RepoDetailHeader } from "@/components/repo-detail/RepoDetailHeader";
import { RepoDetailStats } from "@/components/repo-detail/RepoDetailStats";
import { RepoDetailStatsStrip } from "@/components/repo-detail/RepoDetailStatsStrip";
import { RepoDetailChart } from "@/components/repo-detail/RepoDetailChart";
import { buildMentionMarkers } from "@/components/repo-detail/MentionMarkers";
import { CrossSignalBreakdown } from "@/components/repo-detail/CrossSignalBreakdown";
import { RecentMentionsFeed } from "@/components/repo-detail/RecentMentionsFeed";
import { toMentionItem } from "@/components/repo-detail/MentionMeta";
import type { MentionItem } from "@/components/repo-detail/MentionMeta";
import { RepoSignalSnapshot } from "@/components/repo-detail/RepoSignalSnapshot";
import { ProjectSurfaceMap } from "@/components/repo-detail/ProjectSurfaceMap";
import { NpmAdoptionPanel } from "@/components/repo-detail/NpmAdoptionPanel";
import { RepoActionRow } from "@/components/repo-detail/RepoActionRow";
import { RepoReactions } from "@/components/reactions/RepoReactions";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import { MaintainerCard } from "@/components/repo-detail/MaintainerCard";
import { TwitterSignalPanel } from "@/components/twitter/TwitterSignalPanel";
import { RepoRevenuePanel } from "@/components/repo-detail/RepoRevenuePanel";
import { WhyTrending } from "@/components/repo-detail/WhyTrending";
import { FundingPanel } from "@/components/repo-detail/FundingPanel";
import { RelatedReposPanel } from "@/components/repo-detail/RelatedReposPanel";
import { PredictionSnapshot } from "@/components/repo-detail/PredictionSnapshot";
import { RelatedIdeasPanel } from "@/components/repo-detail/RelatedIdeasPanel";

// force-dynamic: the page aggregates per-source mention JSON at request
// time and has ~thousands of possible (owner, name) tuples. Static
// prerender of all of them blows the build-time chunk graph (Sprint 1
// audit finding #2: ./<N>.js module-not-found). On-demand rendering is
// fast enough — each request reads committed JSON + runs a small compose
// — and matches the pre-rewrite behavior.
export const dynamic = "force-dynamic";

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

  // SoftwareSourceCode JSON-LD — kept identical to the previous version so
  // search engines see no schema regression on the URL.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: repo.fullName,
    description: repo.description,
    codeRepository: repo.url,
    programmingLanguage: repo.language ?? undefined,
    url: absoluteUrl(`/repo/${repo.owner}/${repo.name}`),
    author: {
      "@type": "Organization",
      name: repo.owner,
      url: `https://github.com/${repo.owner}`,
    },
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: repo.stars,
    },
    keywords: [repo.language, ...(repo.topics ?? [])]
      .filter(Boolean)
      .join(", "),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Sticky breadcrumb strip — unchanged behavior, terminal tone. */}
      <div className="sticky top-14 z-30 bg-bg-primary/90 backdrop-blur-md border-b border-border-primary">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 font-mono text-xs text-text-tertiary"
          >
            <Link
              href="/"
              className="hover:text-text-primary transition-colors"
            >
              Home
            </Link>
            <span aria-hidden>›</span>
            <span className="text-text-primary font-medium truncate max-w-[260px] sm:max-w-none">
              {repo.fullName}
            </span>
          </nav>
          <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-text-tertiary">
              <TrendingUp size={12} aria-hidden />
              <span>Rank:</span>
              <span className="text-text-primary">#{repo.rank}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-brand">
              <Flame size={12} aria-hidden />
              <span className="text-text-tertiary">Momentum:</span>
              <span>{repo.momentumScore.toFixed(1)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap size={12} className="text-warning" aria-hidden />
              <span className="text-text-tertiary">24h:</span>
              <span
                className={repo.starsDelta24h >= 0 ? "text-up" : "text-down"}
              >
                {repo.starsDelta24h >= 0 ? "+" : ""}
                {formatNumber(repo.starsDelta24h)} ★
              </span>
            </span>
            <span className="hidden md:inline text-text-tertiary">
              · refreshed {lastRefresh}
            </span>
          </div>
        </div>
      </div>

      {/* Page body — terminal-tone, monospace baseline, 1400px container
          to match /breakouts and the rest of the modernized surfaces. */}
      <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          {/* Header + Maintainer card sit side-by-side on lg+, stack on mobile.
              Maintainer card lives in a right rail (~280px) so the header
              keeps room to breathe, and the action row + stats below run
              full width as before. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
            <RepoDetailHeader
              repo={repo}
              twitterBadge={profile.twitter?.rowBadge ?? null}
            />
            <MaintainerCard
              owner={repo.owner}
              fallbackAvatarUrl={repo.ownerAvatarUrl}
            />
          </div>
          <RepoActionRow repo={repo} />
          <RepoReactions
            repoFullName={repo.fullName}
            initialCounts={initialReactionCounts}
          />
          {/*
            Signal-first layout: "Why Trending" answers the user's first
            question (why should I care?) above the quantitative snapshot.
            Renders null when no reasons are available for this repo.
          */}
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

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
            <RepoDetailStatsStrip repo={repo} />
            <RepoDetailStats repo={repo} />
          </div>

          <NpmAdoptionPanel
            packages={profile.npm.packages}
            dailyDownloads={profile.npm.dailyDownloads}
            dependentsByPackage={profile.npm.dependents}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          <RepoDetailChart repo={repo} markers={markers} />
          {profile.twitter ? <TwitterSignalPanel panel={profile.twitter} /> : null}
        </div>
      </main>
    </>
  );
}
