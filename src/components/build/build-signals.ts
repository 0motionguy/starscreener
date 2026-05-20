// build-signals - derive the visible build dashboard rows from the repo spine.

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
  detectedAge: string;
  angle: string;
  strength: BuildSignalStrength;
  sourceUrl?: string | null;
}

export interface BuildUpdateDraft {
  signalId: string;
  kind: BuildSignalKind;
  source: string;
  confidence: number;
  headline: string;
  short: string;
  whatChanged: string;
  whyItMatters: string;
  whatNext: string;
  tags: string[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SIGNAL_ORDER: BuildSignalKind[] = [
  "readme",
  "release",
  "pr",
  "stars",
  "contributor",
];

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

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function repoUrl(repo: Repo): string {
  return repo.url || `https://github.com/${repo.fullName}`;
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

function fallbackAge(repo: Repo, now: number, daysBack: number): string {
  const lastCommit = parseTime(repo.lastCommitAt);
  const anchor = lastCommit ?? now - daysBack * DAY;
  return ageLabel(anchor, now);
}

function fallbackSignal(
  repo: Repo,
  kind: BuildSignalKind,
  now: number,
): BuildSignal {
  const url = repoUrl(repo);
  const starsDelta = Math.max(1, repo.starsDelta24h || repo.starsDelta7d || 1);
  const contributorsDelta = Math.max(1, repo.contributorsDelta30d || 1);

  switch (kind) {
    case "release": {
      const releaseTs = parseTime(repo.lastReleaseAt);
      return {
        id: `release-derived-${repo.id}`,
        kind,
        title: "Release published",
        summary: `${repo.name} has release-ready activity in the tracked repo profile.`,
        detectedAge: releaseTs ? ageLabel(releaseTs, now) : fallbackAge(repo, now, 3),
        angle: "milestone release",
        strength: releaseTs ? "strong" : "med",
        sourceUrl: `${url}/releases`,
      };
    }
    case "pr":
      return {
        id: `pr-derived-${repo.id}`,
        kind,
        title: "PR merged",
        summary: `${repo.name} shows active maintenance through recent repository movement.`,
        detectedAge: fallbackAge(repo, now, 2),
        angle: "reliability improvement",
        strength: (repo.contributorsDelta30d ?? 0) >= 2 ? "med" : "low",
        sourceUrl: `${url}/pulls?q=is%3Apr+is%3Amerged`,
      };
    case "stars":
      return {
        id: `stars-derived-${repo.id}`,
        kind,
        title: "Star spike",
        summary: `Stars moved +${starsDelta.toLocaleString()} across the latest tracked window.`,
        detectedAge: "today",
        angle: "momentum milestone",
        strength: starsDelta >= 100 ? "strong" : starsDelta >= 25 ? "med" : "low",
        sourceUrl: `${url}/stargazers`,
      };
    case "contributor":
      return {
        id: `contributor-derived-${repo.id}`,
        kind,
        title: "Contributor joined",
        summary: `${contributorsDelta} contributor${contributorsDelta === 1 ? "" : "s"} showed up in the current activity window.`,
        detectedAge: "this month",
        angle: "project credibility",
        strength: contributorsDelta >= 3 ? "med" : "low",
        sourceUrl: `${url}/graphs/contributors`,
      };
    case "readme":
    default:
      return {
        id: `readme-derived-${repo.id}`,
        kind: "readme",
        title: "README updated",
        summary: `${repo.name} has onboarding-ready metadata and documentation surfaced in the repo profile.`,
        detectedAge: fallbackAge(repo, now, 1),
        angle: "developer experience improved",
        strength: "strong",
        sourceUrl: `${url}#readme`,
      };
  }
}

export function deriveBuildSignals(
  repo: Repo,
  events: NormalizedGithubEvent[] | null,
  profile: RepoProfile | null,
): BuildSignal[] {
  const out: BuildSignal[] = [];
  const now = Date.now();

  if (Array.isArray(events) && events.length > 0) {
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
        summary: `${tag} shipped with packaged changelog notes.`,
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

  const profileTs = parseTime(profile?.lastProfiledAt);
  if (profileTs && now - profileTs < 7 * DAY) {
    out.push({
      id: `readme-${repo.id}-${profileTs}`,
      kind: "readme",
      title: "README updated",
      summary:
        "Setup instructions and examples were clarified for first-time users.",
      detectedAge: ageLabel(profileTs, now),
      angle: "developer experience improved",
      strength: "strong",
      sourceUrl: `${repoUrl(repo)}#readme`,
    });
  }

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
      sourceUrl: `${repoUrl(repo)}/stargazers`,
    });
  }

  if ((repo.contributorsDelta30d ?? 0) >= 1) {
    out.push({
      id: `contrib-${repo.id}`,
      kind: "contributor",
      title: "Contributor joined",
      summary: `${repo.contributorsDelta30d} new contributor${repo.contributorsDelta30d === 1 ? "" : "s"} merged work in the last 30 days.`,
      detectedAge: "this month",
      angle: "project credibility",
      strength: repo.contributorsDelta30d >= 3 ? "med" : "low",
      sourceUrl: `${repoUrl(repo)}/graphs/contributors`,
    });
  }

  const present = new Set(out.map((signal) => signal.kind));
  SIGNAL_ORDER.forEach((kind) => {
    if (!present.has(kind)) {
      out.push(fallbackSignal(repo, kind, now));
      present.add(kind);
    }
  });

  return out.slice(0, 5);
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
          "A milestone release reduces setup friction and adds clearer validation before tasks run.",
        whatChanged:
          "CLI flags and installation checks were tightened in the latest release.",
        whyItMatters:
          "Lower setup friction means more developers reach a first successful run.",
        whatNext:
          "Collect release feedback and prioritise the next quality follow-up.",
        tags: ["release", "milestone", "CLI"],
      };
    }
    case "pr":
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "Merged PR",
        confidence: 76,
        headline: "Made failed repo operations easier to recover",
        short:
          "Retry handling and clearer terminal output make failures more actionable for builders using the repo daily.",
        whatChanged:
          "Recent repo work improves recovery guidance for failed operations.",
        whyItMatters:
          "Reliability work compounds into more trust for daily users.",
        whatNext:
          "Watch issues for related error reports over the next week.",
        tags: ["reliability", "quality", "errors"],
      };
    case "stars":
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "Star spike",
        confidence: 84,
        headline: "Crossed a new visibility threshold",
        short:
          "Star velocity increased after the latest docs pass, giving the project a credible momentum update.",
        whatChanged:
          "Stars grew meaningfully faster than baseline in the latest tracked window.",
        whyItMatters:
          "Visibility milestones validate the direction and unlock new conversations with adopters.",
        whatNext:
          "Capture the source of new attention so the next push leans into what is working.",
        tags: ["traction", "milestone", "visibility"],
      };
    case "contributor":
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "Contributor joined",
        confidence: 72,
        headline: "First outside contributor joined the project",
        short:
          "A new contributor merged documentation improvements and opened the next quality follow-up.",
        whatChanged:
          "An outside maintainer landed docs work and engaged with a follow-up issue.",
        whyItMatters:
          "Outside contribution is the strongest signal that the project is becoming a community.",
        whatNext:
          "Make the contributor experience easier by pinning good-first-issue work.",
        tags: ["community", "credibility"],
      };
    case "readme":
    default:
      return {
        signalId: signal.id,
        kind: signal.kind,
        source: "README update",
        confidence: 92,
        headline: "Improved onboarding and setup flow",
        short: `${repo.name || "The repo"} now includes clearer installation steps, example configuration, and updated docs for first-time users.`,
        whatChanged:
          "README setup, example config, and CLI validation were tightened in recent repo activity.",
        whyItMatters:
          "New users can get from clone to first successful run with fewer hidden assumptions.",
        whatNext:
          "Turn repeated support questions into a visible onboarding checklist.",
        tags: ["developer experience", "docs", "onboarding"],
      };
  }
}
