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
// Mentions are aggregated server-side from the static per-source JSON
// (data/{reddit,hackernews,bluesky,devto,producthunt}-*.json) so the
// client bundle stays free of mention payloads.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flame, TrendingUp, Zap } from "lucide-react";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { redditPostHref } from "@/lib/reddit";
import { getRedditMentions } from "@/lib/reddit-data";
import { getHnMentions } from "@/lib/hackernews";
import { getBlueskyMentions, bskyPostHref } from "@/lib/bluesky";
import { getDevtoMentions } from "@/lib/devto";
import { getLaunchForRepo } from "@/lib/producthunt";
import { getNpmPackagesForRepo } from "@/lib/npm";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { RepoDetailHeader } from "@/components/repo-detail/RepoDetailHeader";
import { RepoDetailStats } from "@/components/repo-detail/RepoDetailStats";
import { RepoDetailStatsStrip } from "@/components/repo-detail/RepoDetailStatsStrip";
import { RepoDetailChart } from "@/components/repo-detail/RepoDetailChart";
import { buildMentionMarkers } from "@/components/repo-detail/MentionMarkers";
import { CrossSignalBreakdown } from "@/components/repo-detail/CrossSignalBreakdown";
import { RecentMentionsFeed } from "@/components/repo-detail/RecentMentionsFeed";
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
import { getTwitterRepoPanel } from "@/lib/twitter/service";
import type { TwitterRepoPanel } from "@/lib/twitter/types";
import { TwitterSignalPanel } from "@/components/twitter/TwitterSignalPanel";
import {
  getRevenueOverlay,
  getSelfReportedOverlay,
  getTrustmrrClaimOverlay,
} from "@/lib/revenue-overlays";
import { RepoRevenuePanel } from "@/components/repo-detail/RepoRevenuePanel";
import { WhyTrending } from "@/components/repo-detail/WhyTrending";
import { getRepoReasons } from "@/lib/repo-reasons";
import { FundingPanel } from "@/components/repo-detail/FundingPanel";
import { getFundingEventsForRepo } from "@/lib/funding/repo-events";
import { getFreshnessSnapshot } from "@/lib/source-health";
import { RelatedReposPanel } from "@/components/repo-detail/RelatedReposPanel";
import { getRelatedReposFor } from "@/lib/repo-related";
import { getDailyDownloadsForPackage } from "@/lib/npm-daily";
import { getNpmDependentsCount } from "@/lib/npm-dependents";
import { PredictionSnapshot } from "@/components/repo-detail/PredictionSnapshot";
import { getPredictionForRepo } from "@/lib/repo-predictions";
import { RelatedIdeasPanel } from "@/components/repo-detail/RelatedIdeasPanel";
import { getIdeasForRepo } from "@/lib/repo-ideas";

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

/**
 * Build a normalized mention list from every per-source loader. Returns
 * the merged list sorted by recency desc; the client tab component then
 * filters by source on demand.
 */
function buildMentions(
  fullName: string,
  twitterPanel: TwitterRepoPanel | null,
): MentionItem[] {
  const out: MentionItem[] = [];

  // Reddit — top 5 by score, but enriched posts have createdUtc which we
  // convert to ISO. The list is then re-sorted client-side anyway.
  const reddit = getRedditMentions(fullName);
  if (reddit) {
    for (const p of reddit.posts.slice(0, 50)) {
      out.push({
        id: `reddit-${p.id}`,
        source: "reddit",
        title: p.title,
        author: `u/${p.author} · r/${p.subreddit}`,
        score: p.score,
        scoreLabel: "upvotes",
        secondary: { label: "comments", value: p.numComments },
        url: redditPostHref(p.permalink, p.url),
        createdAt: new Date(p.createdUtc * 1000).toISOString(),
        matchReason: "repo identity",
      });
    }
  }

  // HackerNews
  const hn = getHnMentions(fullName);
  if (hn) {
    for (const s of hn.stories.slice(0, 50)) {
      out.push({
        id: `hn-${s.id}`,
        source: "hn",
        title: s.title,
        author: s.by,
        score: s.score,
        scoreLabel: "points",
        secondary: { label: "comments", value: s.descendants },
        url: `https://news.ycombinator.com/item?id=${s.id}`,
        createdAt: new Date(s.createdUtc * 1000).toISOString(),
        matchReason: "repo identity",
      });
    }
  }

  // Bluesky
  const bsky = getBlueskyMentions(fullName);
  if (bsky) {
    for (const p of bsky.posts.slice(0, 50)) {
      const handle = p.author?.handle ?? "unknown";
      out.push({
        id: `bsky-${p.uri}`,
        source: "bluesky",
        title: p.text,
        author: `@${handle}`,
        score: p.likeCount,
        scoreLabel: "likes",
        secondary: { label: "reposts", value: p.repostCount },
        url: p.bskyUrl || bskyPostHref(p.uri, handle),
        createdAt: p.createdAt,
        matchReason: "repo identity",
      });
    }
  }

  // dev.to
  const devto = getDevtoMentions(fullName);
  if (devto) {
    for (const a of devto.articles.slice(0, 50)) {
      out.push({
        id: `devto-${a.id}`,
        source: "devto",
        title: a.title,
        author: `@${a.author?.username ?? "anon"}`,
        score: a.reactionsCount,
        scoreLabel: "reactions",
        secondary: { label: "comments", value: a.commentsCount },
        url: a.url,
        createdAt: a.publishedAt,
        matchReason: "repo identity",
      });
    }
  }

  // ProductHunt — at most one tracked launch per repo by design.
  const ph = getLaunchForRepo(fullName);
  if (ph) {
    out.push({
      id: `ph-${ph.id}`,
      source: "ph",
      title: `${ph.name} — ${ph.tagline}`,
      author: ph.makers?.[0] ? `@${ph.makers[0].username}` : "—",
      score: ph.votesCount,
      scoreLabel: "votes",
      secondary: { label: "comments", value: ph.commentsCount },
      url: ph.url,
      createdAt: ph.createdAt,
      matchReason: "linked repo",
    });
  }

  // Twitter — per-post detail from the repo panel's topPosts preview list.
  // Engagement is already rolled (likes + reposts + replies + quotes) by
  // the scoring layer, so we surface it as the primary metric.
  if (twitterPanel) {
    for (const p of twitterPanel.topPosts.slice(0, 50)) {
      const handle = p.authorHandle.replace(/^@+/, "");
      out.push({
        id: `twitter-${p.postId}`,
        source: "twitter",
        title: p.text,
        author: `@${handle}`,
        score: p.engagement,
        scoreLabel: "engagement",
        url: p.postUrl,
        createdAt: p.postedAt,
        matchReason: p.whyMatched || `twitter · ${p.matchedBy}`,
      });
    }
  }

  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export default async function RepoDetailPage({ params }: PageProps) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    notFound();
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    notFound();
  }

  const twitterPanel = await getTwitterRepoPanel(repo.fullName);
  const mentions = buildMentions(repo.fullName, twitterPanel);
  const freshness = getFreshnessSnapshot();
  const whyTrendingReasons = getRepoReasons(repo.fullName);
  const fundingEvents = getFundingEventsForRepo(repo.fullName);
  const npmPackages = getNpmPackagesForRepo(repo.fullName);
  // Per-package 30d daily downloads + dependents — both read from local
  // JSONL/JSON snapshots produced by scripts/scrape-npm-daily.mjs. Absent
  // packages render a sparkline of zeros and no dep badge; no network call.
  const npmDailyDownloads: Record<string, { date: string; downloads: number }[]> = {};
  const npmDependentsByPackage: Record<string, number | null> = {};
  for (const pkg of npmPackages) {
    npmDailyDownloads[pkg.name] = getDailyDownloadsForPackage(pkg.name);
    npmDependentsByPackage[pkg.name] = getNpmDependentsCount(pkg.name);
  }
  const relatedRepos = getRelatedReposFor(repo.fullName);
  const prediction = getPredictionForRepo(repo.fullName);
  const ideas = getIdeasForRepo(repo.fullName);
  const productHuntLaunch = getLaunchForRepo(repo.fullName);
  // Verified overlay (from the TrustMRR catalog sync) and, separately, an
  // approved TrustMRR-link claim that has not yet been matched by the sync.
  // They are kept distinct so the claim never renders with "verified" chrome —
  // the UI shows a neutral pointer card for the claim until the sweep
  // promotes it to a verified overlay.
  const revenueOverlay = getRevenueOverlay(repo.fullName);
  const trustmrrClaimOverlay = revenueOverlay
    ? null
    : getTrustmrrClaimOverlay(repo.fullName);
  const selfReportedOverlay = getSelfReportedOverlay(repo.fullName);
  // Server-render the reaction counts so the strip below the action row
  // shows real numbers on first paint instead of zeros + a spinner. The
  // client component still re-fetches if a user takes any action.
  const initialReactionCounts = countReactions(
    await listReactionsForObject("repo", repo.fullName),
  );
  // Cross-channel marker dots for the Stars chart — pre-built server-side
  // so the client RepoDetailChart bundle stays free of every per-source
  // mentions JSON.
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
              twitterBadge={twitterPanel?.rowBadge ?? null}
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
          <WhyTrending reasons={whyTrendingReasons} />
          <PredictionSnapshot
            prediction={prediction}
            currentStars={repo.stars}
          />
          <RepoSignalSnapshot
            repo={repo}
            mentions={mentions}
            npmPackages={npmPackages}
            productHuntLaunch={productHuntLaunch}
          />

          <RepoRevenuePanel
            verified={revenueOverlay}
            selfReported={selfReportedOverlay}
            trustmrrClaim={trustmrrClaimOverlay}
          />
          <FundingPanel events={fundingEvents} />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
            <RepoDetailStatsStrip repo={repo} />
            <RepoDetailStats repo={repo} />
          </div>

          <NpmAdoptionPanel
            packages={npmPackages}
            dailyDownloads={npmDailyDownloads}
            dependentsByPackage={npmDependentsByPackage}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProjectSurfaceMap
              repo={repo}
              npmPackages={npmPackages}
              productHuntLaunch={productHuntLaunch}
            />
            <CrossSignalBreakdown repo={repo} />
          </div>

          <RecentMentionsFeed mentions={mentions} freshness={freshness} />
          <RelatedReposPanel items={relatedRepos} />
          <RelatedIdeasPanel items={ideas} />
          <RepoDetailChart repo={repo} markers={markers} />
          {twitterPanel ? <TwitterSignalPanel panel={twitterPanel} /> : null}
        </div>
      </main>
    </>
  );
}
