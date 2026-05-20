// Repo detail — phase 1B. Per-repo profile page wired from the data spine.
// Dynamic per-repo data isn't always hot, so this route opts out of ISR
// and renders on demand.

import { notFound } from "next/navigation";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
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
import { getFundingEventsForRepo } from "@/lib/funding/repo-events";
import { synthesizeWhy } from "@/lib/why-narrative";

import { RepoHeroCard } from "@/components/repo/RepoHeroCard";
import { WhyTrendingPanel } from "@/components/repo/WhyTrendingPanel";
import { RepoKpiStrip } from "@/components/repo/RepoKpiStrip";
import {
  StarHistoryChart,
  type ChartEvent,
} from "@/components/repo/StarHistoryChart";
import { SourceBreakdownGrid } from "@/components/repo/SourceBreakdownGrid";
import { MentionTimelineStrip } from "@/components/repo/MentionTimelineStrip";
import { RepoValueStrip } from "@/components/repo/RepoValueStrip";
import {
  RepoActivityFeed,
  FEED_FILTERS,
  FEED_SORTS,
  type FeedFilter,
  type FeedSort,
} from "@/components/repo/RepoActivityFeed";
import { MaintainersRow } from "@/components/repo/MaintainersRow";
import { ReleasesCard } from "@/components/repo/ReleasesCard";
import { OrgFundingCard } from "@/components/repo/OrgFundingCard";
import { RelatedReposCard } from "@/components/repo/RelatedReposCard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps) {
  const { owner, name } = await params;
  const full = `${owner}/${name}`;
  return {
    title: `${full} — TrendingRepo`,
    description: `Trending signal profile for ${full}: stars, forks, mentions across HN, Reddit, X, Bluesky and more. Updated continuously.`,
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

function chartEventFromGithubEvent(
  event: NormalizedGithubEvent,
  index: number,
): ChartEvent | null {
  const createdAt = event.createdAt ? Date.parse(event.createdAt) : NaN;
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const x = Number.isFinite(createdAt)
    ? Math.min(0.96, Math.max(0.04, (createdAt - yearAgo) / (now - yearAgo)))
    : Math.min(0.92, 0.22 + index * 0.18);

  if (event.type === "ReleaseEvent") {
    const release = (event.payload as {
      release?: { tag_name?: string; name?: string };
    }).release;
    return {
      x,
      y: Math.max(0.08, 0.34 - index * 0.05),
      label: release?.tag_name ?? release?.name ?? "release",
      color: "var(--up)",
    };
  }

  if (event.type === "WatchEvent") {
    return {
      x,
      y: 0.18,
      label: "star surge",
      color: "var(--warning)",
    };
  }

  if (event.type === "PullRequestEvent") {
    const pr = (event.payload as { pull_request?: { number?: number } })
      .pull_request;
    return {
      x,
      y: 0.42,
      label: `PR #${pr?.number ?? index + 1}`,
      color: "var(--info)",
    };
  }

  return null;
}

function deriveChartEvents(
  repo: NonNullable<ReturnType<typeof getDerivedRepoByFullName>>,
  events: NormalizedGithubEvent[],
): ChartEvent[] {
  const derived = events
    .map(chartEventFromGithubEvent)
    .filter((event): event is ChartEvent => Boolean(event))
    .slice(0, 4);

  if (derived.length >= 3) return derived;

  if (repo.lastReleaseTag) {
    derived.push({
      x: 0.9,
      y: 0.12,
      label: repo.lastReleaseTag,
      color: "var(--up)",
    });
  }

  if (repo.starsDelta7d > 0) {
    derived.push({
      x: 0.78,
      y: 0.24,
      label: `+${repo.starsDelta7d.toLocaleString()} stars`,
      color: "var(--accent)",
    });
  }

  if ((repo.channelsFiring ?? 0) > 0) {
    derived.push({
      x: 0.86,
      y: 0.32,
      label: `${repo.channelsFiring} sources`,
      color: "var(--info)",
    });
  }

  return derived.slice(0, 4);
}

export default async function RepoDetailPage({ params, searchParams }: PageProps) {
  const { owner, name } = await params;
  const fullName = `${owner}/${name}`;
  const sp = (await searchParams) ?? {};
  const rawFeed = typeof sp.feed === "string" ? sp.feed : "all";
  const activeFeedFilter: FeedFilter =
    (FEED_FILTERS as readonly string[]).includes(rawFeed)
      ? (rawFeed as FeedFilter)
      : "all";
  const rawSort = typeof sp.sort === "string" ? sp.sort : "default";
  const activeFeedSort: FeedSort =
    (FEED_SORTS as readonly string[]).includes(rawSort)
      ? (rawSort as FeedSort)
      : "default";

  // Trending + profiles + star-activity + github-events are independent
  // store reads; serialising them adds 3 round-trips of dead latency.
  // Parallelise via Promise.all — each refresh has its own internal
  // 30s rate-limit + in-flight dedupe so a parallel call is still cheap.
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoProfilesFromStore().catch(() => undefined),
    refreshStarActivityFromStore(fullName).catch(() => undefined),
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

  const fundingEvents = (() => {
    try {
      return getFundingEventsForRepo(fullName);
    } catch {
      return [];
    }
  })();

  const related = (() => {
    try {
      return getRelatedReposFor(fullName);
    } catch {
      return [];
    }
  })();

  // Repo profile lives in a separate store; the why-panel uses
  // synthesizeWhy regardless, but having the profile loaded means future
  // surfaces can hang npm / homepage / PH off the same render pass.
  const profile = (() => {
    try {
      return getRepoProfile(fullName);
    } catch {
      return null;
    }
  })();

  const why = (() => {
    try {
      return synthesizeWhy(repo);
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

  const chartEvents = deriveChartEvents(repo, events);

  return (
    <div className="repo-detail-shell">
      <div className="repo-hero">
        <RepoHeroCard repo={repo} profile={profile} />
        <WhyTrendingPanel repo={repo} preloadedText={why?.text ?? null} />
      </div>

      <RepoKpiStrip repo={repo} starActivity={starActivity} profile={profile} />

      <StarHistoryChart
        repo={repo}
        starActivity={starActivity}
        events={chartEvents}
      />

      <div className="row between" style={{ margin: "8px 0 10px" }}>
        <div className="eyebrow">▌ Mentions by source · 4 primary channels</div>
        {typeof repo.channelsFiring === "number" && repo.channelsFiring > 0 ? (
          <span className="chip up">{repo.channelsFiring} active</span>
        ) : null}
      </div>
      <SourceBreakdownGrid repo={repo} />

      <MentionTimelineStrip repo={repo} />

      <RepoValueStrip repo={repo} />

      <div className="body-grid">
        <RepoActivityFeed
          repo={repo}
          events={events}
          fundingEvents={fundingEvents}
          fetchedAt={fetchedAt}
          activeFilter={activeFeedFilter}
          activeSort={activeFeedSort}
        />

        <aside className="col gap-4">
          <MaintainersRow repo={repo} events={events} />
          <ReleasesCard repo={repo} events={events} />
          <OrgFundingCard repo={repo} events={fundingEvents} />
          <RelatedReposCard repo={repo} related={related} />
        </aside>
      </div>
    </div>
  );
}
