// /repo/[owner]/[name] — modernized repo detail page.
//
// Mostly a server component that composes:
//   1. RepoDetailHeader  — identity + badges + cross-signal score callout
//   2. RepoActionRow     — Watch / Compare / open on GitHub (client)
//   3. RepoDetailStats   — 6-up stats grid
//   4. RepoChart         — preserved star-history chart (client, recharts)
//   5. CrossSignalBreakdown — 5 horizontal channel bars
//   6. RecentMentionsFeed   — tabbed mention feed (All · per-source) (client)
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
import { getRedditMentions } from "@/lib/reddit";
import { getHnMentions } from "@/lib/hackernews";
import { getBlueskyMentions, bskyPostHref } from "@/lib/bluesky";
import { getDevtoMentions } from "@/lib/devto";
import { getLaunchForRepo } from "@/lib/producthunt";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { RepoDetailHeader } from "@/components/repo-detail/RepoDetailHeader";
import { RepoDetailStats } from "@/components/repo-detail/RepoDetailStats";
import { RepoDetailStatsStrip } from "@/components/repo-detail/RepoDetailStatsStrip";
import { RepoDetailChart } from "@/components/repo-detail/RepoDetailChart";
import { buildMentionMarkers } from "@/components/repo-detail/MentionMarkers";
import { CrossSignalBreakdown } from "@/components/repo-detail/CrossSignalBreakdown";
import {
  RecentMentionsFeed,
  type MentionItem,
} from "@/components/repo-detail/RecentMentionsFeed";
import { RepoActionRow } from "@/components/repo-detail/RepoActionRow";
import { MaintainerCard } from "@/components/repo-detail/MaintainerCard";

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
function buildMentions(fullName: string): MentionItem[] {
  const out: MentionItem[] = [];

  // Reddit — top 5 by score, but enriched posts have createdUtc which we
  // convert to ISO. The list is then re-sorted client-side anyway.
  const reddit = getRedditMentions(fullName);
  if (reddit) {
    for (const p of reddit.posts.slice(0, 10)) {
      out.push({
        id: `reddit-${p.id}`,
        source: "reddit",
        title: p.title,
        author: `u/${p.author} · r/${p.subreddit}`,
        score: p.score,
        secondary: { label: "comments", value: p.numComments },
        url: `https://reddit.com${p.permalink}`,
        createdAt: new Date(p.createdUtc * 1000).toISOString(),
      });
    }
  }

  // HackerNews
  const hn = getHnMentions(fullName);
  if (hn) {
    for (const s of hn.stories.slice(0, 10)) {
      out.push({
        id: `hn-${s.id}`,
        source: "hn",
        title: s.title,
        author: s.by,
        score: s.score,
        secondary: { label: "comments", value: s.descendants },
        url: `https://news.ycombinator.com/item?id=${s.id}`,
        createdAt: new Date(s.createdUtc * 1000).toISOString(),
      });
    }
  }

  // Bluesky
  const bsky = getBlueskyMentions(fullName);
  if (bsky) {
    for (const p of bsky.posts.slice(0, 10)) {
      const handle = p.author?.handle ?? "unknown";
      out.push({
        id: `bsky-${p.uri}`,
        source: "bluesky",
        title: p.text,
        author: `@${handle}`,
        score: p.likeCount,
        secondary: { label: "reposts", value: p.repostCount },
        url: p.bskyUrl || bskyPostHref(p.uri, handle),
        createdAt: p.createdAt,
      });
    }
  }

  // dev.to
  const devto = getDevtoMentions(fullName);
  if (devto) {
    for (const a of devto.articles.slice(0, 10)) {
      out.push({
        id: `devto-${a.id}`,
        source: "devto",
        title: a.title,
        author: `@${a.author?.username ?? "anon"}`,
        score: a.reactionsCount,
        secondary: { label: "comments", value: a.commentsCount },
        url: a.url,
        createdAt: a.publishedAt,
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
      secondary: { label: "comments", value: ph.commentsCount },
      url: ph.url,
      createdAt: ph.createdAt,
    });
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

  const mentions = buildMentions(repo.fullName);
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
            <RepoDetailHeader repo={repo} />
            <MaintainerCard
              owner={repo.owner}
              fallbackAvatarUrl={repo.ownerAvatarUrl}
            />
          </div>
          <RepoActionRow repo={repo} />
          {/*
            Tiered chart area: 3 mini-cards (hero metrics) → big Stars chart
            with cross-channel mention markers → secondary stats grid below.
            Splitting Stars/Forks/Contributors out of a shared linear axis
            fixes the old "forks look flat, contributors invisible" issue.
          */}
          <RepoDetailStatsStrip repo={repo} />
          <RepoDetailChart repo={repo} markers={markers} />
          <RepoDetailStats repo={repo} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CrossSignalBreakdown repo={repo} />
            <RecentMentionsFeed mentions={mentions} />
          </div>
        </div>
      </main>
    </>
  );
}
