import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flame, TrendingUp, Zap } from "lucide-react";

export const dynamic = "force-dynamic";
import { getDefaultSocialAdapters } from "@/lib/pipeline/adapters/social-adapters";
import {
  NitterAdapter,
  TWITTER_AVAILABLE,
} from "@/lib/pipeline/adapters/nitter-adapter";
import {
  buildDerivedWhyMoving,
  getDerivedRelatedRepos,
} from "@/lib/derived-insights";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import type { SocialMention } from "@/lib/types";
import type { RepoMention } from "@/lib/pipeline/types";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { RepoHeader } from "@/components/detail/RepoHeader";
import { RepoActions } from "@/components/detail/RepoActions";
import { RepoChart } from "@/components/detail/RepoChart";
import { WhyMoving as WhyMovingSection } from "@/components/detail/WhyMoving";
import { SocialMentions } from "@/components/detail/SocialMentions";
import { RelatedRepos } from "@/components/detail/RelatedRepos";

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

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    notFound();
  }

  // Fetch mentions live from the social adapters. Each adapter swallows its
  // own errors and returns []; we wrap the whole fan-out in try/catch so a
  // completely offline environment still renders the page.
  let mentions: SocialMention[] = [];
  try {
    const adapters = getDefaultSocialAdapters();
    if (TWITTER_AVAILABLE) {
      adapters.push(new NitterAdapter());
    }
    const results = await Promise.all(
      adapters.map((a) => a.fetchMentionsForRepo(repo.fullName)),
    );
    const repoMentions: RepoMention[] = results.flat();
    // Narrow the pipeline RepoMention shape down to the SocialMention the
    // UI expects. Both fields are stable; we just drop the pipeline-only
    // columns (authorFollowers, reach, discoveredAt, isInfluencer).
    mentions = repoMentions.map((m) => ({
      id: m.id,
      repoId: m.repoId,
      platform: m.platform,
      author: m.author,
      content: m.content,
      url: m.url,
      sentiment: m.sentiment,
      engagement: m.engagement,
      postedAt: m.postedAt,
    }));
    // Newest first so the UI's natural rendering order matches recency.
    mentions.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  } catch (err) {
    console.error(
      `[repo-page] social fetch for ${repo.fullName} failed`,
      err,
    );
    mentions = [];
  }

  const whyMoving = buildDerivedWhyMoving(repo);
  const related = getDerivedRelatedRepos(repo, 6);

  const lastRefresh = getRelativeTime(new Date().toISOString());

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
      {/* Structured data — SoftwareSourceCode schema so search engines
          surface the repo as a first-class object. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Top strip — matches terminal pages. Sticky so breadcrumb stays
          visible while scrolling through a long detail page. */}
      <div className="sticky top-14 z-30 bg-bg-primary/90 backdrop-blur-md border-b border-border-primary">
        <div className="max-w-full mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-text-tertiary"
          >
            <Link href="/" className="hover:text-text-primary transition-colors">
              Home
            </Link>
            <span aria-hidden>›</span>
            <span className="text-text-primary font-medium">
              {repo.fullName}
            </span>
          </nav>
          <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
            <span className="inline-flex items-center gap-1.5 text-text-tertiary">
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
              <span className={repo.starsDelta24h >= 0 ? "text-up" : "text-down"}>
                {repo.starsDelta24h >= 0 ? "+" : ""}
                {formatNumber(repo.starsDelta24h)} ★
              </span>
            </span>
            <span className="text-text-tertiary hidden sm:inline">
              · updated {lastRefresh}
            </span>
          </div>
        </div>
      </div>

      {/* Content — constrained to max-w-5xl so the page stays within the
          terminal window instead of sprawling full-width. */}
      <main className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6">
        <RepoHeader repo={repo} />
        <RepoActions repo={repo} />
        <RepoChart repo={repo} />
        <WhyMovingSection whyMoving={whyMoving} />
        <SocialMentions
          mentions={mentions}
          twitterAvailable={TWITTER_AVAILABLE}
        />
        <RelatedRepos repos={related} />
      </main>
    </>
  );
}
