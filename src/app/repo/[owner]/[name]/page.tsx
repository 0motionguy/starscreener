// Repo detail — Profile-standalone parity rebuild.
//
// Renders the exact section tree from C:/tmp/asset_e0686a47.js lines 1048-1112
// (App + Footer). Mounts the 7 profile components owned by Agents 2-8 inside
// a `.pf-main-inner` wrapper, then `<ProfileFooter />` as a sibling.
//
// Dynamic per-repo data isn't always hot, so this route opts out of ISR and
// renders on demand.

import { notFound } from "next/navigation";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  refreshRepoProfilesFromStore,
  getRepoProfile,
} from "@/lib/repo-profiles";
import {
  refreshStarActivityFromStore,
  getStarActivity,
} from "@/lib/star-activity";
import {
  refreshGithubEventsIndexFromStore,
  getGithubEventsRepoByFullName,
  readGithubEventsForRepo,
  type NormalizedGithubEvent,
} from "@/lib/github-events";
import { getRelatedReposFor } from "@/lib/repo-related";
import { getDailyDownloadsForPackage } from "@/lib/npm-daily";
import {
  refreshRepoCommunityProfileFromStore,
  getRepoCommunityProfile,
} from "@/lib/repo-community-profile";
import {
  refreshRepoEditorialFromStore,
  getRepoEditorial,
} from "@/lib/repo-editorial-store";
import { listCommentsForRepo } from "@/lib/repo-comments";
import {
  getReactionsForComment,
  emptyReactionAggregate,
} from "@/lib/repo-comment-reactions";
import { getLikeStatus } from "@/lib/repo-likes";
import { getReactionStatus } from "@/lib/repo-reactions";
import {
  refreshConsensusVerdictsFromStore,
  getConsensusItemReport,
  getConsensusVerdictsPayload,
} from "@/lib/consensus-verdicts";
import { buildRepoJsonLd } from "@/lib/seo/repo-jsonld";
import { buildBreadcrumbJsonLd, buildFaqJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategoryMeta } from "@/lib/categories";
import { getOptionalUser } from "@/lib/auth/server";
import type { CrossSourceChannel, Repo } from "@/lib/types";

import { RepoHeroCard } from "@/components/repo/RepoHeroCard";
import { RepoOwnerRepoSnapshot } from "@/components/repo/RepoOwnerRepoSnapshot";
import { RepoSignalSummary } from "@/components/repo/RepoSignalSummary";
import { RepoEditorialOverview } from "@/components/repo/RepoEditorialOverview";
import {
  RepoStarChart,
  type ChartRange,
  type ChartScale,
  type ReleaseMarker,
  type MentionMarker,
} from "@/components/repo/RepoStarChart";
import { RelatedReposCard } from "@/components/repo/RelatedReposCard";
import { RepoCommentsThread } from "@/components/repo/RepoCommentsThread";
import { RepoFaq, buildFaq } from "@/components/repo/RepoFaq";
import { RepoDatesFooter } from "@/components/repo/RepoDatesFooter";

import { ProfileFooter } from "@/components/layout/ProfileFooter";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps) {
  const { owner, name } = await params;
  const full = `${owner}/${name}`;
  const ogPath = `/api/og/repo/${owner}/${name}`;

  // Prefer the AISO/Kimi verdict summary for the meta description — it's
  // original, specific, evidence-based prose that makes a far better search
  // snippet than the generic boilerplate. Falls back when no verdict exists.
  let description = `Trending signal profile for ${full}: stars, forks, mentions across HN, Reddit, X, Bluesky and more. Updated continuously.`;
  try {
    await refreshConsensusVerdictsFromStore();
    const verdict = getConsensusItemReport(full);
    if (verdict && verdict.summary.trim().length > 0) {
      description = clampDescription(verdict.summary);
    }
  } catch {
    /* keep boilerplate */
  }

  return {
    // Value-forward title (CTR): bare repo-name titles lose to GitHub itself
    // on name queries. `absolute` bypasses the layout's "%s — TrendingRepo"
    // template so the keywords aren't pushed past Google's ~60-char cutoff.
    title: { absolute: `${full} — stars, momentum & trend analysis · TrendingRepo` },
    description,
    openGraph: {
      title: `${full} — TrendingRepo`,
      description,
      images: [{ url: ogPath, width: 1200, height: 630, alt: `${full} on TrendingRepo` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${full} — TrendingRepo`,
      description,
      images: [ogPath],
    },
  };
}

async function loadGithubEvents(
  fullName: string,
): Promise<NormalizedGithubEvent[]> {
  try {
    await refreshGithubEventsIndexFromStore();
    const entry = getGithubEventsRepoByFullName(fullName);
    if (!entry) return [];
    const result = await readGithubEventsForRepo(entry.repoId);
    return result.data?.events ?? [];
  } catch {
    return [];
  }
}

function buildReleaseMarkers(events: NormalizedGithubEvent[]): ReleaseMarker[] {
  const out: ReleaseMarker[] = [];
  for (const event of events) {
    if (event.type !== "ReleaseEvent") continue;
    if (!event.createdAt) continue;
    const release = (event.payload as {
      release?: { tag_name?: string; name?: string; html_url?: string };
    }).release;
    out.push({
      ts: event.createdAt,
      tag: release?.tag_name ?? release?.name ?? "release",
      url: release?.html_url ?? "",
    });
    if (out.length >= 8) break;
  }
  return out;
}

function buildMentionMarkers(repo: Repo): MentionMarker[] {
  const out: MentionMarker[] = [];
  const detail = repo.mentions?.detail?.perSource;
  if (!detail) return out;

  for (const source of Object.keys(detail) as CrossSourceChannel[]) {
    const bucket = detail[source];
    const top = bucket?.top?.[0];
    if (!top) continue;
    out.push({
      ts: top.observedAt,
      source,
      title: (top.title ?? "").slice(0, 60),
      url: top.url,
    });
    if (out.length >= 6) break;
  }
  return out;
}

export default async function RepoDetailPage({ params, searchParams }: PageProps) {
  const { owner, name } = await params;
  const fullName = `${owner}/${name}`;
  const sp = (await searchParams) ?? {};

  const rawRange = typeof sp.range === "string" ? sp.range : "1y";
  const RANGE_KEYS: readonly ChartRange[] = ["1m", "3m", "6m", "1y", "all"];
  const activeRange: ChartRange =
    (RANGE_KEYS as readonly string[]).includes(rawRange)
      ? (rawRange as ChartRange)
      : "1y";

  const rawScale = typeof sp.scale === "string" ? sp.scale : "lin";
  const activeScale: ChartScale = rawScale === "log" ? "log" : "lin";

  // Trending + profiles + star-activity + fork-activity + community profile
  // are independent store reads; parallelise them.
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoProfilesFromStore().catch(() => undefined),
    refreshStarActivityFromStore(fullName).catch(() => undefined),
    refreshRepoCommunityProfileFromStore(fullName).catch(() => undefined),
    // Per-repo LLM editorial overview (written by the worker drop-deep-enrich
    // -drain for freshly-dropped repos). Absent for most repos — harmless.
    refreshRepoEditorialFromStore(fullName).catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
    // Hydrate per-source mention caches + cross-source detail so the profile's
    // source pips + mention block render the live redis data (not a cold cache).
    refreshAllMentionStores().catch(() => undefined),
    // Hydrate the persistent repo-registry so a repo that has dropped out of
    // the live trending feed still resolves here (instead of 404ing).
    refreshRepoRegistryFromStore().catch(() => undefined),
  ]);

  const repo = (() => {
    try {
      return getDerivedRepoByFullName(fullName);
    } catch {
      return null;
    }
  })();

  if (!repo) {
    notFound();
  }

  const starActivity = (() => {
    try {
      return getStarActivity(fullName);
    } catch {
      return null;
    }
  })();

  const events = await loadGithubEvents(fullName);

  const related = (() => {
    try {
      return getRelatedReposFor(fullName);
    } catch {
      return [];
    }
  })();

  const profile = (() => {
    try {
      return getRepoProfile(fullName);
    } catch {
      return null;
    }
  })();

  const community = (() => {
    try {
      return getRepoCommunityProfile(fullName);
    } catch {
      return null;
    }
  })();

  const editorial = (() => {
    try {
      return getRepoEditorial(fullName);
    } catch {
      return null;
    }
  })();

  // AISO/Kimi consensus verdict for this repo. null when the analyst hasn't
  // produced one yet — the Signal Summary falls back to local synthesis.
  const consensusItem = (() => {
    try {
      return getConsensusItemReport(fullName);
    } catch {
      return null;
    }
  })();

  const consensusComputedAt = (() => {
    try {
      return getConsensusVerdictsPayload().computedAt || null;
    } catch {
      return null;
    }
  })();

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  // Auth + per-user state. getOptionalUser() returns null for signed-out
  // viewers so the page renders publicly with sign-in CTAs where needed.
  const user = await getOptionalUser();
  const clerkUserId = user?.clerkUserId ?? null;
  const signedIn = user !== null;
  const authRedirectUrl = `/repo/${owner}/${name}`;

  // Comments + reactions (loaded once on the server; the client widgets
  // hydrate with these as seed values).
  const comments = await listCommentsForRepo(fullName).catch(() => []);
  const reactionEntries = await Promise.all(
    comments.map(async (comment) => {
      try {
        const reactions = await getReactionsForComment(comment.id, clerkUserId);
        return [comment.id, reactions] as const;
      } catch {
        return [comment.id, emptyReactionAggregate()] as const;
      }
    }),
  );
  const initialReactions = Object.fromEntries(reactionEntries);

  // Like + unicorn status (server-side seed for the hero's reaction row).
  // Parallelize — both are independent JSONL reads.
  const [likeStatus, unicornStatus] = await Promise.all([
    getLikeStatus(fullName, clerkUserId).catch(() => ({
      count: 0,
      liked: false,
    })),
    getReactionStatus(fullName, "unicorn", clerkUserId).catch(() => ({
      count: 0,
      active: false,
    })),
  ]);

  // npm-daily series for the chart's npm-downloads overlay.
  const npmPackage = profile?.surfaces.npmPackages[0] ?? null;
  const npmDaily = npmPackage ? getDailyDownloadsForPackage(npmPackage) : [];

  // Chart event markers — release events + cross-source mention markers
  // (real timestamps, real URLs, no synthetic fallback).
  const releaseMarkers = buildReleaseMarkers(events);
  const mentionMarkers = buildMentionMarkers(repo);

  // Weekly commit cadence for the bar overlay on the chart.
  const commitsLast52Weeks = community?.commitsLast52Weeks ?? [];

  const jsonLd = buildRepoJsonLd(repo, consensusItem, consensusComputedAt, editorial);

  // FAQ + breadcrumb structured data. FAQ entries are shared with the
  // rendered <RepoFaq> (same buildFaq) so the FAQPage text matches the DOM;
  // RepoFaq hides itself below 3 answerable Q's, so mirror that gate here.
  const faqEntries = buildFaq({ repo, community, profile });
  const faqLd =
    faqEntries.length >= 3
      ? buildFaqJsonLd(faqEntries.map((e) => ({ q: e.q, a: e.text })))
      : null;
  const categoryMeta = getCategoryMeta(repo.categoryId);
  const breadcrumbLd = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Categories", path: "/categories" },
    ...(categoryMeta
      ? [{ name: categoryMeta.name, path: `/categories/${categoryMeta.id}` }]
      : []),
    { name: repo.fullName, path: `/repo/${repo.owner}/${repo.name}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={faqLd} />
      <div className="pf-main-inner">
        {/* 1. Hero — full width. Pulse card removed: constellation/firing
            data is sparse for most repos and the empty state read as
            broken. Bring it back when per-source 24h counts are wired. */}
        <RepoHeroCard
          repo={repo}
          profile={profile}
          likeCount={likeStatus.count}
          liked={likeStatus.liked}
          unicornStatus={unicornStatus}
          commentsCount={comments.length}
          signedIn={signedIn}
          signInUrl={authRedirectUrl}
        />

        {/* 2. Owner / Repo snapshot — absorbs language breakdown + org card */}
        <section className="pf-section">
          <RepoOwnerRepoSnapshot repo={repo} community={community} />
        </section>

        {/* 3. Star history — full width. Placed ABOVE the signal summary so
            the timeline leads the analysis (the "why it's trending" prose
            reads better with the chart already in view). Fork chart removed:
            no fork-activity series exists yet. */}
        <section className="pf-section">
          <RepoStarChart
            repo={repo}
            starActivity={starActivity}
            npmDaily={npmDaily}
            npmPackage={npmPackage}
            commitsLast52Weeks={commitsLast52Weeks}
            releases={releaseMarkers}
            mentions={mentionMarkers}
            range={activeRange}
            scale={activeScale}
          />
        </section>

        {/* 3b. Editorial overview — LLM "what it is" card for dropped repos
            (only present when the deep-enrich drain wrote one). */}
        {editorial ? <RepoEditorialOverview editorial={editorial} /> : null}

        {/* 4. Signal summary — prose verdict, below the chart */}
        <RepoSignalSummary
          repo={repo}
          community={community}
          profile={profile}
          consensusItem={consensusItem}
          fetchedAt={fetchedAt}
        />

        {/* 5. Related repos */}
        <RelatedReposCard repo={repo} related={related} />

        {/* 6. FAQ — crawlable Q&A (mirrors the FAQPage JSON-LD above) */}
        <RepoFaq repo={repo} community={community} profile={profile} />

        {/* 7. Comments */}
        <RepoCommentsThread
          repoFullName={fullName}
          comments={comments}
          initialReactions={initialReactions}
          currentUserId={clerkUserId}
          signInUrl={authRedirectUrl}
        />

        {/* 8. Dates — closing card with machine-readable <time> */}
        <RepoDatesFooter repo={repo} events={events} />
      </div>
      <ProfileFooter fetchedAt={fetchedAt} />
    </>
  );
}
