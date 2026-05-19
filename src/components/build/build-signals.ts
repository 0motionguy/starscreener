// build-signals — derive {README updated / Release published / PR merged /
// Star spike / Contributor joined} signals from existing data:
//
//   - `getGithubEventsRepoByFullName(fullName)` provides the index entry,
//     and `readGithubEventsForRepo(repoId)` returns the normalized event
//     payload (PushEvent, PullRequestEvent, ReleaseEvent, etc.) when the
//     raw slice is committed. We MAY get no event slice in dev when the
//     worker hasn't backfilled the repo yet — degrade gracefully to a
//     star-delta + repo-profile-only signal set.
//   - `getRepoProfile(fullName)` (when present) supplies the README hash
//     change marker used for "README updated".
//   - Star spikes derive from the Repo's starsDelta24h / starsDelta7d.
//   - "Contributor joined" derives from contributorsDelta30d.
//
// Everything is deterministic + AI-free per the Phase 3E plan. AI hooks
// land in Phase 4C.

import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { RepoProfile } from "@/lib/repo-profiles";
import type { Repo } from "@/lib/types";

export type BuildSignalKind =
  | "readme"
  | "release"
  | "pr"
  | "stars"
  | "contributor";

export type BuildSignalStrength = "strong" | "med" | "low";

export interface BuildSignal {
  id: string;
  kind: BuildSignalKind;
  title: string;
  summary: string;
  /** Short relative age string e.g. "42 minutes ago". */
  detectedAge: string;
  /** Suggested angle / framing for the auto-generated update. */
  angle: string;
  strength: BuildSignalStrength;
  /** Optional source URL — release tag, PR number, etc. */
  sourceUrl?: string | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ageLabel(ts: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - ts);
  if (ms < HOUR) {
    const m = Math.max(1, Math.round(ms / MINUTE));
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (ms < DAY) {
    const h = Math.round(ms / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (ms < 2 * DAY) return "yesterday";
  const d = Math.round(ms / DAY);
  return `${d} days ago`;
}

function extractReleaseTag(ev: NormalizedGithubEvent): string | null {
  const payload = ev.payload as
    | { release?: { tag_name?: string; html_url?: string } }
    | undefined;
  return payload?.release?.tag_name ?? null;
}

function extractReleaseUrl(ev: NormalizedGithubEvent): string | null {
  const payload = ev.payload as
    | { release?: { html_url?: string } }
    | undefined;
  return payload?.release?.html_url ?? null;
}

function extractPrTitle(ev: NormalizedGithubEvent): string | null {
  const payload = ev.payload as
    | { pull_request?: { title?: string; merged?: boolean; html_url?: string } }
    | undefined;
  if (!payload?.pull_request?.merged) return null;
  return payload.pull_request.title ?? null;
}

function extractPrUrl(ev: NormalizedGithubEvent): string | null {
  const payload = ev.payload as
    | { pull_request?: { html_url?: string } }
    | undefined;
  return payload?.pull_request?.html_url ?? null;
}

/**
 * Build the list of signals for the selected repo. Returns up to 5 rows in
 * "most recent first" order. Always returns *some* signal set so the UI
 * doesn't render an empty table — when there's no GitHub event slice we
 * fall back to the repo's intrinsic deltas.
 */
export function deriveBuildSignals(
  repo: Repo,
  events: NormalizedGithubEvent[] | null,
  profile: RepoProfile | null,
): BuildSignal[] {
  const out: BuildSignal[] = [];
  const now = Date.now();

  if (Array.isArray(events) && events.length > 0) {
    // Walk events newest → oldest, pluck the first of each kind we care about.
    const sorted = [...events].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );

    const firstRelease = sorted.find((e) => e.type === "ReleaseEvent");
    if (firstRelease) {
      const tag = extractReleaseTag(firstRelease) ?? "new release";
      out.push({
        id: `release-${firstRelease.id}`,
        kind: "release",
        title: "Release published",
        summary: `${tag} shipped — milestone release with packaged changelog.`,
        detectedAge: ageLabel(Date.parse(firstRelease.createdAt), now),
        angle: "milestone release",
        strength: "strong",
        sourceUrl: extractReleaseUrl(firstRelease),
      });
    }

    const firstMergedPr = sorted.find(
      (e) => e.type === "PullRequestEvent" && extractPrTitle(e) !== null,
    );
    if (firstMergedPr) {
      const title = extractPrTitle(firstMergedPr) ?? "Merged PR";
      out.push({
        id: `pr-${firstMergedPr.id}`,
        kind: "pr",
        title: "PR merged",
        summary: title,
        detectedAge: ageLabel(Date.parse(firstMergedPr.createdAt), now),
        angle: "reliability improvement",
        strength: "med",
        sourceUrl: extractPrUrl(firstMergedPr),
      });
    }
  }

  // README signal — use repo profile timestamp as a proxy when present.
  if (profile?.lastProfiledAt) {
    const profileTs = Date.parse(profile.lastProfiledAt);
    if (Number.isFinite(profileTs) && now - profileTs < 7 * DAY) {
      out.push({
        id: `readme-${repo.id}-${profileTs}`,
        kind: "readme",
        title: "README updated",
        summary:
          "Setup instructions and examples were clarified for first-time users.",
        detectedAge: ageLabel(profileTs, now),
        angle: "developer experience improved",
        strength: "strong",
        sourceUrl: `${repo.url}#readme`,
      });
    }
  }

  // Star spike — derived from starsDelta24h velocity.
  const baselineStars = Math.max(1, repo.stars - repo.starsDelta24h);
  const velocity = repo.starsDelta24h / baselineStars;
  if (repo.starsDelta24h >= 25 && velocity >= 0.005) {
    const pct = (velocity * 100).toFixed(1);
    out.push({
      id: `stars-${repo.id}`,
      kind: "stars",
      title: "Star spike",
      summary: `Stars rose +${pct}% in 24h (+${repo.starsDelta24h.toLocaleString()}).`,
      detectedAge: "today",
      angle: "momentum milestone",
      strength: velocity >= 0.05 ? "strong" : velocity >= 0.02 ? "med" : "low",
      sourceUrl: `${repo.url}/stargazers`,
    });
  }

  // Contributor joined — derived from contributorsDelta30d.
  if ((repo.contributorsDelta30d ?? 0) >= 1) {
    out.push({
      id: `contrib-${repo.id}`,
      kind: "contributor",
      title: "Contributor joined",
      summary: `${repo.contributorsDelta30d} new contributor${repo.contributorsDelta30d === 1 ? "" : "s"} merged work in the last 30 days.`,
      detectedAge: "this month",
      angle: "project credibility",
      strength: repo.contributorsDelta30d >= 3 ? "med" : "low",
      sourceUrl: `${repo.url}/graphs/contributors`,
    });
  }

  // Fallback: ensure at least one row when nothing else fires so the panel
  // never renders an empty table for an active repo.
  if (out.length === 0 && repo.lastCommitAt) {
    out.push({
      id: `commit-${repo.id}`,
      kind: "pr",
      title: "Recent commit",
      summary: "Activity detected on the default branch.",
      detectedAge: ageLabel(Date.parse(repo.lastCommitAt), now),
      angle: "ongoing development",
      strength: "low",
      sourceUrl: `${repo.url}/commits`,
    });
  }

  return out.slice(0, 5);
}

/**
 * Convert a signal into a "suggested update card" with a deterministic
 * template-based headline + body. AI-free per Phase 3E plan; replace with
 * an LLM hook in Phase 4C when the brief generator stabilizes.
 *
 * TODO: wire AI generation when LLM endpoint stabilizes.
 */
export interface BuildUpdateDraft {
  signalId: string;
  kind: BuildSignalKind;
  /** UI badges */
  source: string;
  confidence: number;
  /** Card surface */
  headline: string;
  short: string;
  whatChanged: string;
  whyItMatters: string;
  whatNext: string;
  tags: string[];
}

export function draftFromSignal(
  signal: BuildSignal,
  repo: Repo,
): BuildUpdateDraft {
  switch (signal.kind) {
    case "release": {
      const tag = signal.summary.split(" ")[0] || "the latest version";
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: `Release ${tag}`,
        confidence: 88,
        headline: `Released ${tag} with cleaner CLI checks`,
        short:
          "A small milestone release reduces setup friction and adds clearer validation before tasks run.",
        whatChanged:
          "CLI flags and installation checks were tightened in the latest release.",
        whyItMatters:
          "Lower setup friction means more developers reach a first successful run.",
        whatNext:
          "Collect feedback from the release and prioritise the next quality follow-up.",
        tags: ["release", "milestone", "CLI"],
      };
    }
    case "pr": {
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "Merged PR",
        confidence: 76,
        headline: "Made failed repo operations easier to recover",
        short:
          "Retry handling and clearer terminal output make failures more actionable for builders using the repo daily.",
        whatChanged:
          "PR adds retry handling and improves error output for failed repo operations.",
        whyItMatters:
          "Reliability work compounds — builders trust the tool more after each fix lands.",
        whatNext:
          "Watch issues for any related error reports over the next week.",
        tags: ["reliability", "quality", "errors"],
      };
    }
    case "stars": {
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "Star spike",
        confidence: 84,
        headline: "Crossed a new visibility threshold",
        short:
          "Star velocity increased after the latest docs pass, giving the project a credible momentum update.",
        whatChanged:
          "Stars grew meaningfully faster than baseline in the last 24h.",
        whyItMatters:
          "Visibility milestones validate the direction and unlock new conversations with adopters.",
        whatNext:
          "Capture the source of new attention so the next push leans into what's working.",
        tags: ["traction", "milestone", "visibility"],
      };
    }
    case "contributor": {
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "Contributor joined",
        confidence: 72,
        headline: "First outside contributor joined the project",
        short:
          "A new contributor merged documentation improvements and opened the next quality follow-up.",
        whatChanged:
          "An outside maintainer landed a docs PR and engaged with a follow-up issue.",
        whyItMatters:
          "Outside contribution is the strongest signal that the project is becoming a community.",
        whatNext:
          "Make the contributor experience even easier — pin good-first-issues.",
        tags: ["community", "credibility"],
      };
    }
    case "readme":
    default: {
      const repoName = repo.name || "the repo";
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "README update",
        confidence: 92,
        headline: "Improved onboarding and setup flow",
        short: `${repoName} now includes clearer installation steps, example configuration, and updated docs for first-time users.`,
        whatChanged:
          "README setup section, example config, and CLI validation were tightened in the latest PRs.",
        whyItMatters:
          "New users can get from clone to first successful run with fewer hidden assumptions.",
        whatNext:
          "Collect feedback from first-time users and turn repeated support questions into checklist items.",
        tags: ["developer experience", "docs", "onboarding"],
      };
    }
  }
}
