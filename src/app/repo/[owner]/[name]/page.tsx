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
import { StarHistoryChart } from "@/components/repo/StarHistoryChart";
import { SourceBreakdownGrid } from "@/components/repo/SourceBreakdownGrid";
import { MentionTimelineStrip } from "@/components/repo/MentionTimelineStrip";
import { RepoActivityFeed } from "@/components/repo/RepoActivityFeed";
import { MaintainersRow } from "@/components/repo/MaintainersRow";
import { ReleasesCard } from "@/components/repo/ReleasesCard";
import { OrgFundingCard } from "@/components/repo/OrgFundingCard";
import { RelatedReposCard } from "@/components/repo/RelatedReposCard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
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

export default async function RepoDetailPage({ params }: PageProps) {
  const { owner, name } = await params;
  const fullName = `${owner}/${name}`;

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
  void profile;

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

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <div className="repo-hero">
        <RepoHeroCard repo={repo} />
        <WhyTrendingPanel repo={repo} preloadedText={why?.text ?? null} />
      </div>

      <RepoKpiStrip repo={repo} starActivity={starActivity} />

      <StarHistoryChart repo={repo} starActivity={starActivity} events={[]} />

      <div className="row between" style={{ margin: "8px 0 10px" }}>
        <div className="eyebrow">▌ Mentions by source · 4 primary channels</div>
        {typeof repo.channelsFiring === "number" && repo.channelsFiring > 0 ? (
          <span className="chip up">{repo.channelsFiring} active</span>
        ) : null}
      </div>
      <SourceBreakdownGrid repo={repo} />

      <MentionTimelineStrip repo={repo} />

      <div className="body-grid">
        <RepoActivityFeed
          repo={repo}
          events={events}
          fundingEvents={fundingEvents}
          fetchedAt={fetchedAt}
        />

        <aside className="col gap-4">
          <MaintainersRow repo={repo} events={events} />
          <ReleasesCard repo={repo} events={events} />
          <OrgFundingCard owner={repo.owner} events={fundingEvents} />
          <RelatedReposCard related={related} />
        </aside>
      </div>
    </div>
  );
}
