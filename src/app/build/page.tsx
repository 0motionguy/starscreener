// /build — Build workflow dashboard. Phase 3E of the UI v6 rebuild.
//
// Auth: Clerk-gated. Anon → 302 /sign-in?redirect_url=/build.
//
// Wires:
//   getDerivedRepoByFullName(fullName)    — repo card stats + 6-cell scoring
//   getGithubEventsRepoByFullName(...)    — release / PR slice for signals
//   readGithubEventsForRepo(repoId)       — normalized event list
//   getRepoProfile(fullName)              — README hash + freshness anchor
//   classifyFreshness("repos", ts)        — honest freshness pill
//
// URL contract: ?repo=<owner>/<name> selects the workspace. Empty → empty
// state + repo dropdown.
//
// Dynamic: per-user repo + draft state, freshness pill honesty.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { classifyFreshness } from "@/lib/news/freshness";
import {
  refreshGithubEventsIndexFromStore,
  getGithubEventsRepoByFullName,
  readGithubEventsForRepo,
  type NormalizedGithubEvent,
} from "@/lib/github-events";
import {
  getDerivedRepoByFullName,
  getDerivedRepos,
} from "@/lib/derived-repos";
import {
  refreshRepoProfilesFromStore,
  getRepoProfile,
} from "@/lib/repo-profiles";
import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";

import { BuildHero } from "@/components/build/BuildHero";
import { BuildWalkthrough } from "@/components/build/BuildWalkthrough";
import { BuildRepoSelector } from "@/components/build/BuildRepoSelector";
import { BuildSignalsTable } from "@/components/build/BuildSignalsTable";
import { BuildUpdateCards } from "@/components/build/BuildUpdateCards";
import { BuildReviewPanel } from "@/components/build/BuildReviewPanel";
import { BuildTimelinePreview } from "@/components/build/BuildTimelinePreview";
import { BuildEmptyStates } from "@/components/build/BuildEmptyStates";
import {
  deriveBuildSignals,
  draftFromSignal,
  type BuildSignal,
  type BuildUpdateDraft,
} from "@/components/build/build-signals";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Build",
  description:
    "Turn GitHub progress into public build updates. Detected signals, suggested drafts, and a project timeline you control.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function parseRepoParam(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Basic shape guard: owner/name with no slashes inside either segment.
  if (!/^[^/\s]+\/[^/\s]+$/.test(trimmed)) return null;
  return trimmed;
}

export default async function BuildPage({ searchParams }: Props) {
  // 1. Auth gate — anon bounces through Clerk back here.
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/build");
  }

  // 2. Parse selected repo + bring caches online.
  const params = (await searchParams) ?? {};
  const requestedFullName = parseRepoParam(params.repo);

  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshRepoProfilesFromStore(),
    refreshGithubEventsIndexFromStore(),
  ]);

  // 3. Tracked repo list for the dropdown (full names only).
  const tracked = safe(() => getDerivedRepos(), []).slice(0, 100).map((r) => ({
    fullName: r.fullName,
    owner: r.owner,
    name: r.name,
  }));

  // 4. Resolve the selected repo (if any).
  const selectedRepo = requestedFullName
    ? safe(() => getDerivedRepoByFullName(requestedFullName), null)
    : null;

  const repoFullName = selectedRepo?.fullName ?? "";

  // 5. Pull GitHub event slice + repo profile when a repo is selected.
  let events: NormalizedGithubEvent[] | null = null;
  if (selectedRepo) {
    const indexEntry = safe(
      () => getGithubEventsRepoByFullName(selectedRepo.fullName),
      null,
    );
    if (indexEntry) {
      try {
        const result = await readGithubEventsForRepo(indexEntry.repoId);
        const payload = result.data as { events?: NormalizedGithubEvent[] } | null;
        events = Array.isArray(payload?.events) ? payload.events : null;
      } catch {
        events = null;
      }
    }
  }

  const profile = selectedRepo
    ? safe(() => getRepoProfile(selectedRepo.fullName), null)
    : null;

  // 6. Derive signals + draft cards.
  const signals: BuildSignal[] = selectedRepo
    ? deriveBuildSignals(selectedRepo, events, profile)
    : [];
  const drafts: BuildUpdateDraft[] = selectedRepo
    ? signals.map((s) => draftFromSignal(s, selectedRepo))
    : [];

  // 7. Active "review" card from URL hash → resolved client-side; server
  //    just passes the first draft as the initial editor payload.
  const initialDraft = drafts[0] ?? null;
  const draftsByKey: Record<string, BuildUpdateDraft> = drafts.reduce(
    (acc, draft) => {
      acc[`card-${draft.kind}`] = draft;
      return acc;
    },
    {} as Record<string, BuildUpdateDraft>,
  );

  // 8. Honest freshness verdict — used in the ticker / status meta. Anchor
  //    to the trending fetchedAt because that's the cron that informs the
  //    star-spike + delta signals.
  const trendingFetchedAt = safe(() => getLastFetchedAt(), null);
  const freshness = classifyFreshness("repos", trendingFetchedAt ?? null);
  const freshnessLabel =
    freshness.status === "live"
      ? "LIVE"
      : freshness.status === "warn"
        ? "WARM"
        : "STALE";

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <BuildHero
        hasRepoSelected={Boolean(selectedRepo)}
        selectedFullName={selectedRepo?.fullName ?? null}
      />

      <BuildWalkthrough />

      <div className="build-grid">
        <div className="left-stack">
          <BuildRepoSelector
            selectedRepo={selectedRepo}
            trackedRepos={tracked}
          />

          {selectedRepo ? (
            <>
              <BuildSignalsTable
                signals={signals}
                repoFullName={selectedRepo.fullName}
              />
              <BuildUpdateCards drafts={drafts} />
              <BuildReviewPanel
                initialDraft={initialDraft}
                draftsByKey={draftsByKey}
                repoFullName={repoFullName}
              />
            </>
          ) : null}
        </div>

        <aside className="right-stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Workspace status</h2>
              <span className="meta">
                <span className={`live-dot ${freshness.status}`} /> {freshnessLabel} · scanned {freshness.ageLabel}
              </span>
            </div>
            <div className="context-list">
              <div className="context-row">
                <span>Selected repo</span>
                <b>{selectedRepo?.fullName ?? "—"}</b>
              </div>
              <div className="context-row">
                <span>Detected signals</span>
                <b>{signals.length}</b>
              </div>
              <div className="context-row">
                <span>Draft updates</span>
                <b>{drafts.length}</b>
              </div>
              <div className="context-row">
                <span>Pending review</span>
                <b>{Math.min(drafts.length, 2)}</b>
              </div>
              <div className="context-row">
                <span>Launch readiness</span>
                <b>{selectedRepo ? Math.round(selectedRepo.momentumScore ?? 0) : 0}</b>
              </div>
            </div>
          </section>

          <BuildTimelinePreview recentSignals={signals} />

          <BuildEmptyStates hasRepoSelected={Boolean(selectedRepo)} />
        </aside>
      </div>
    </div>
  );
}
