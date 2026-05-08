// /repo/[owner]/[name] — modernized repo detail page.
//
// CACHE CONTRACT
// kind:        ISR
// revalidate:  300 (5 min) for known repos
// audience:    public
// freshness:   known repos: 5min behind cron-driven snapshot;
//              unknown repos: 30min ISR via /api/internal/github/live-repo
// invalidates: n/a
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
//
// Cold-miss path (repo not in our derived set): we no longer call
// fetchGitHubRepoLive() inline. Instead we fetch the bounded internal API
// at /api/internal/github/live-repo, which has its own SWR cache and a
// 1.5s upstream timeout. That keeps page TTFB independent of GitHub's
// latency and shares the CDN cache across cold-miss visitors.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Repo } from "@/lib/types";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME, safeJsonLd, SITE_URL } from "@/lib/seo";
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
import { CompletenessStrip } from "@/components/repo-detail/CompletenessStrip";
import { toMentionItem } from "@/components/repo-detail/MentionMeta";
import type { MentionItem } from "@/components/repo-detail/MentionMeta";
import { RepoSignalSnapshot } from "@/components/repo-detail/RepoSignalSnapshot";
import { ProjectSurfaceMap } from "@/components/repo-detail/ProjectSurfaceMap";
import { NpmAdoptionPanel } from "@/components/repo-detail/NpmAdoptionPanel";
import { MarkRepoViewed } from "@/components/repo-detail/MarkRepoViewed";
import { FunnelMount } from "@/components/analytics/FunnelMount";
import { ObjectReactions } from "@/components/reactions/ObjectReactions";
import { RepoIdHero } from "@/components/repo-detail/RepoIdHero";
import { StarHistoryBlock } from "@/components/repo-detail/StarHistoryBlock";
import { OrganizationCard } from "@/components/repo-detail/OrganizationCard";
import { refreshStarActivityFromStore } from "@/lib/star-activity";
import { SectionHead } from "@/components/ui/SectionHead";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import { TwitterSignalPanel } from "@/components/twitter/TwitterSignalPanel";
import { RepoRevenuePanel } from "@/components/repo-detail/RepoRevenuePanel";
import { WhyTrending } from "@/components/repo-detail/WhyTrending";
import { WhyBadge } from "@/components/repo/WhyBadge";
import { getWhyNarrative } from "@/lib/why-narrative";
import { FundingPanel } from "@/components/repo-detail/FundingPanel";
import { RelatedReposPanel } from "@/components/repo-detail/RelatedReposPanel";
import { RelatedIdeasPanel } from "@/components/repo-detail/RelatedIdeasPanel";

// ISR over force-dynamic: the 12+ refresh hooks above each share the
// data-store's 30s rate-limit + dedupe, so calling them on every request
// costs CPU without buying any freshness. 5-min revalidate keeps repos
// plenty fresh while letting Vercel's edge cache serve repeat hits.
// Each (owner, name) tuple gets its own ISR cache entry on first hit;
// stale-while-revalidate handles long-tail repos cheaply.
export const revalidate = 300;

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

// Base-URL resolver for the inner internal-API fetch. Order of preference:
//   1. VERCEL_URL — auto-injected on every Vercel deployment (preview +
//      prod). It's the host without scheme, so we prepend https://.
//   2. SITE_URL from @/lib/seo — uses NEXT_PUBLIC_APP_URL when set.
//   3. http://localhost:<PORT> — local dev fallback. PORT is 3023 per the
//      project's dev-server config.
// We compute this once at module load, NOT inside the page component, so
// it doesn't trip Next 15's dynamic-rendering opt-in.
const INTERNAL_API_BASE: string = (() => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (SITE_URL && !SITE_URL.includes("trendingrepo.com")) return SITE_URL;
  // SITE_URL defaults to https://trendingrepo.com which would be wrong for
  // local dev. Use it only when explicitly overridden via NEXT_PUBLIC_APP_URL.
  if (process.env.NEXT_PUBLIC_APP_URL) return SITE_URL;
  const port = process.env.PORT ?? "3023";
  return `http://localhost:${port}`;
})();

function buildLiveRepoApiUrl(owner: string, name: string): string {
  const params = new URLSearchParams({ owner, name });
  return `${INTERNAL_API_BASE}/api/internal/github/live-repo?${params.toString()}`;
}

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

  // Existence check — try our curated derived set first, then fall back to
  // the bounded internal API at /api/internal/github/live-repo for repos we
  // haven't picked up via trending / manual-repos / pipeline JSONL yet.
  // Live-fetched repos render the same detail layout but show empty
  // cross-source signals (since none of our collectors have scanned them
  // yet) and surface a "tracking started" banner so users understand why
  // every chip is empty.
  //
  // The internal API has its own SWR cache (300s/3600s) and a 1.5s upstream
  // timeout — page TTFB is no longer hostage to GitHub's latency.
  const fullName = `${owner}/${name}`;
  const derivedBase = getDerivedRepoByFullName(fullName);
  let baseRepo: Repo;
  let isLiveFetched = false;
  if (derivedBase) {
    baseRepo = derivedBase;
    // Refresh every data-store-backed cache the canonical profile + render
    // surfaces will read. All in parallel; each is cheap on warm Lambdas.
    // The star-activity refresh is per-repo (one Redis key per repo) — kept
    // alongside the global refreshes here so the inline 90-day chart on the
    // new layout always sees the freshest snapshot.
    //
    // Skipped for live-fetched repos: those caches are empty by definition
    // (no collector has scanned the repo yet), so the fan-out wastes ~700ms
    // of Lambda time per cold miss for nothing.
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
      refreshStarActivityFromStore(`${owner}/${name}`),
    ]);
  } else {
    isLiveFetched = true;
    // Fetch from the bounded internal API. Next dedupes inner fetches on
    // the server, so two concurrent cold-miss requests for the same
    // (owner, name) collapse into one upstream call. revalidate:1800
    // overrides the default 300s on the inner cache so unknown-repo pages
    // share an even longer SWR window across visitors.
    let res: Response;
    try {
      res = await fetch(buildLiveRepoApiUrl(owner, name), {
        next: { revalidate: 1800 },
      });
    } catch (err) {
      console.warn("[repo-detail] internal live-repo fetch threw", err);
      notFound();
    }
    if (!res.ok) {
      // 404 → repo doesn't exist on GitHub. 503 → upstream timeout / 5xx.
      // Both fall through to notFound for now; we don't have a partial-error
      // surface for "GitHub timed out trying to fetch this repo".
      notFound();
    }
    baseRepo = (await res.json()) as Repo;
    // No fan-out: data-store caches are empty for repos our collectors
    // haven't seen yet. Save the ~700ms worth of refresh roundtrips.
  }

  // Single canonical call replaces the fifteen-loader stitch that used to
  // live here. Every surface consumes a slice of `profile`, so any future
  // signal migration only has to touch `buildCanonicalRepoProfile`. For
  // live-fetched repos we pass the synthesized base repo as an override so
  // the profile builder bypasses its derived-store lookup.
  const profile = await buildCanonicalRepoProfile(
    baseRepo.fullName,
    isLiveFetched ? baseRepo : undefined,
  );
  if (!profile) {
    notFound();
  }
  const { repo } = profile;

  // Why-narrative — short caption surfaced above the existing WhyTrending
  // strip. Reads the persisted 24h cache; falls back to live synthesis so
  // long-tail repos outside the persisted top-50 still get a line. AGN-791.
  const whyNarrative = await getWhyNarrative(owner, name, repo);

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

  // Quick surface count for the metric strip's "SURFACE" cell. Mirrors the
  // ProjectSurfaceMap.tsx logic (GitHub · Website · Docs · npm · PRODUCTHUNT
  // · Paper/Model) but stays sync — the full ProjectSurfaceMap component
  // does its own async resolution for the actual cards. This count is just
  // the headline metric.
  const surfaceTotal = 6;
  const npmHomepages = (profile.npm.packages ?? [])
    .map((p) => p.homepage)
    .filter((h): h is string => Boolean(h));
  const hasWebsite = Boolean(
    profile.productHunt?.website ||
      npmHomepages.find((u) => !/github\.com/i.test(u)),
  );
  const hasNpm = (profile.npm.packages ?? []).length > 0;
  const hasProductHunt = Boolean(profile.productHunt);
  const hasPaperModel = Boolean(
    (repo.linkedArxivIds && repo.linkedArxivIds.length > 0) ||
      (repo.linkedHfModels && repo.linkedHfModels.length > 0),
  );
  const surfaceCount =
    1 /* github */ +
    (hasWebsite ? 1 : 0) +
    (hasNpm ? 1 : 0) +
    (hasProductHunt ? 1 : 0) +
    (hasPaperModel ? 1 : 0);

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

      <main className="home-surface repo-detail-page repo-detail-redesign">
        {/* Mockup-aligned hero block: eyebrow + head + verdict band +
            channel chips + 5-up metric strip. Replaces the legacy
            id-strip + repo-verdict + RepoActionRow stack. */}
        <RepoIdHero
          repo={repo}
          fetchedAt={profile.fetchedAt}
          surfaceCount={surfaceCount}
          surfaceTotal={surfaceTotal}
        />

        {/* Tracking notice for repos that just got pulled in via the
            live-fetch fallback. Sits below the hero so users see the
            "why every chip is empty" explainer right after the verdict. */}
        {isLiveFetched ? (
          <div
            className="repo-detail-tracking-banner"
            role="status"
            aria-live="polite"
          >
            Tracking just started for{" "}
            <strong>{repo.fullName}</strong>. Cross-source signals
            (mentions, momentum, deltas) will populate on the next collector
            tick — usually within an hour.
          </div>
        ) : null}

        {/* Invisible analytics + reaction widgets. Kept here so they
            still fire on this surface. */}
        <MarkRepoViewed owner={repo.owner} name={repo.name} />
        <FunnelMount
          step="repo_view"
          flow="discover-repo"
          properties={{ repo: repo.fullName }}
        />
        <ObjectReactions
          objectType="repo"
          objectId={repo.fullName}
          initialCounts={initialReactionCounts}
        />

        {/* // 01 BREAKDOWN — cross-signal per-channel + project surface map.
            Two-column on wide viewports; stacked on narrow. */}
        <SectionHead
          num="// 01"
          title="Breakdown"
          meta={<>Cross-signal &amp; surface map</>}
        />
        <div className="repo-detail-split">
          <CrossSignalBreakdown repo={repo} />
          <ProjectSurfaceMap
            repo={repo}
            npmPackages={profile.npm.packages}
            productHuntLaunch={profile.productHunt}
          />
        </div>

        {/* // 02 GROWTH — 90-day star history + bottom stats strip. The
            inline chart is intentionally read-only; the full-toggles
            sub-route at /star-activity is reachable via the inline
            "full chart →" link. */}
        <SectionHead
          num="// 02"
          title="Growth"
          meta={<>Stars · 90 day · cumulative</>}
        />
        <StarHistoryBlock repo={repo} />

        {/* // 03 MENTIONS — tabbed evidence feed with 14d timeline strip.
            User explicitly flagged this as "very important" in the redesign
            brief; sits directly below the stars chart so the connection
            between a star spike and the post that drove it is one scroll. */}
        <SectionHead
          num="// 03"
          title="Mentions"
          meta={<>14d window · {mentions.length} total</>}
        />
        <RecentMentionsFeed
          mentions={mentions}
          freshness={profile.freshness}
          repoFullName={repo.fullName}
          initialCursor={profile.mentions.nextCursor}
        />

        {/* // 04 CONTEXT — owner organization + 6 vector-similar repos. */}
        <SectionHead
          num="// 04"
          title="Context"
          meta={<>Organization · related repos</>}
        />
        <div className="repo-detail-split">
          <OrganizationCard owner={repo.owner} />
          <RelatedReposPanel items={profile.related} />
        </div>

        {/* // 05 DEEP DIVE — kept for the panels not surfaced in the
            mockup (Why-Trending, Revenue, Funding, NpmAdoption, ideas,
            Twitter signal, completeness, full chart). Collapsed by
            default so the main flow stays clean. */}
        <details className="repo-deep-dive">
          <summary>
            <span className="rdd-num">{"// 05"}</span>
            <span className="rdd-title">Deep dive</span>
            <span className="rdd-meta">expanded panels · {[
              profile.reasons?.length ? "why" : null,
              profile.revenue ? "revenue" : null,
              profile.funding?.length ? "funding" : null,
              (profile.npm.packages ?? []).length ? "npm" : null,
              profile.ideas?.length ? "ideas" : null,
              profile.twitter ? "x" : null,
            ].filter(Boolean).join(" · ") || "auxiliary"}</span>
          </summary>
          <div className="rdd-stack">
            <CompletenessStrip repo={repo} />
            <WhyBadge narrative={whyNarrative} variant="full" />
            <WhyTrending reasons={profile.reasons} />
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
              <RepoDetailStatsStrip
                repo={repo}
                updatedAt={profile.fetchedAt}
              />
              <RepoDetailStats repo={repo} />
            </div>
            <NpmAdoptionPanel
              packages={profile.npm.packages}
              dailyDownloads={profile.npm.dailyDownloads}
              dependentsByPackage={profile.npm.dependents}
            />
            <RelatedIdeasPanel items={profile.ideas} />
            <ErrorBoundary>
              <RepoDetailChartLazy repo={repo} markers={markers} />
            </ErrorBoundary>
            {profile.twitter ? (
              <TwitterSignalPanel panel={profile.twitter} />
            ) : null}
          </div>
        </details>
        <style>{`
          .repo-detail-redesign {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .repo-detail-split {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 12px;
          }
          @media (max-width: 980px) {
            .repo-detail-split { grid-template-columns: 1fr; }
          }
          .repo-deep-dive {
            margin-top: 8px;
            border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
            border-radius: 3px;
            background: var(--v3-bg-050, rgba(255,255,255,0.025));
          }
          .repo-deep-dive > summary {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            font-family: var(--font-geist-mono, monospace);
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--v3-ink-300, rgba(255,255,255,0.7));
            list-style: none;
          }
          .repo-deep-dive > summary::-webkit-details-marker { display: none; }
          .repo-deep-dive > summary::before {
            content: "▶";
            display: inline-block;
            font-size: 9px;
            color: var(--v3-ink-400);
            transition: transform 120ms;
          }
          .repo-deep-dive[open] > summary::before { transform: rotate(90deg); }
          .repo-deep-dive .rdd-num {
            color: var(--v3-acc, #ffcb05);
            font-weight: 700;
          }
          .repo-deep-dive .rdd-title { color: var(--v3-ink-100, #fff); }
          .repo-deep-dive .rdd-meta {
            margin-left: auto;
            color: var(--v3-ink-400);
            letter-spacing: 0.06em;
            text-transform: lowercase;
            font-size: 10px;
          }
          .rdd-stack {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px 14px 16px;
            border-top: 1px solid var(--v3-line-100);
          }
          .repo-detail-tracking-banner {
            padding: 10px 14px;
            border: 1px solid var(--v3-acc, #ffcb05);
            border-radius: 3px;
            background: color-mix(in oklab, var(--v3-acc, #ffcb05) 14%, transparent);
            color: var(--v3-ink-100, #fff);
            font-size: 12px;
          }
        `}</style>
      </main>
    </>
  );
}
