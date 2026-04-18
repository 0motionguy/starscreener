// StarScreener Pipeline — reason detectors
//
// Pure, side-effect-free functions that inspect a Repo + its context and
// emit a single ReasonDetail (or null if the signal is not present).
//
// Each detector is designed to run independently; the generator fans them
// out in parallel and sorts by priority. Keep them fast, predictable, and
// well-commented — this is the surface that explains "why it's moving" to
// end users, so honesty and precision matter.

import type { Repo } from "../../types";
import type { ReasonCode, ReasonDetail, SocialAggregate } from "../types";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface ReasonInput {
  /** Full repo with deltas + metadata. */
  repo: Repo;
  /** Previous overall rank (before latest compute). Enables rank_jump. */
  previousRank?: number;
  /** Aggregated social signals for this repo. */
  socialAggregate?: SocialAggregate;
  /** Set by the scoring engine when the breakout classifier fired. */
  isBreakout?: boolean;
  /** Set by the scoring engine when the quiet-killer classifier fired. */
  isQuietKiller?: boolean;
  /** Average 7-day star velocity for this repo's category. */
  categoryAvgStarVelocity7d?: number;
  /** ID of the category's #1 mover (for category_top). */
  categoryTopId?: string;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 604_800_000;

/**
 * Format an ISO timestamp as a compact "Xh ago" / "Xd ago" / "Xw ago" string.
 *
 * Uses the given `now` (defaults to Date.now()) so callers in tests can
 * inject a deterministic clock. Returns "just now" for <1h deltas and
 * "in the future" for negative deltas (data/clock skew protection).
 */
export function formatTimeframe(
  isoDate: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!isoDate) return "unknown";
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) return "unknown";
  const diff = now - then;
  if (diff < 0) return "in the future";
  if (diff < MS_PER_HOUR) return "just now";
  if (diff < MS_PER_DAY) {
    const hours = Math.floor(diff / MS_PER_HOUR);
    return `${hours}h ago`;
  }
  if (diff < MS_PER_WEEK) {
    const days = Math.floor(diff / MS_PER_DAY);
    return `${days}d ago`;
  }
  const weeks = Math.floor(diff / MS_PER_WEEK);
  return `${weeks}w ago`;
}

function daysSince(isoDate: string | null | undefined, now: number = Date.now()): number | null {
  if (!isoDate) return null;
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) return null;
  return (now - then) / MS_PER_DAY;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Major-version pattern matching
// ---------------------------------------------------------------------------

// Accept clean major versions:
//   v2.0, v15.0, v2.0.0, 1.0.0, 3.0, release-4.0, release/4.0.0, 10.0.0
// Reject non-major OR any pre-release / build-metadata suffix:
//   v2.1, 1.2.3, v0.5.0            (non-major minor or patch)
//   1.3.0a3, 2.0.0b1, 3.0.0rc2     (PEP 440 pre-release — alpha/beta/rc)
//   v1.0.0-rc1, 2.0.0-alpha.2      (semver pre-release)
//   v2.0.0+build.42                (semver build metadata)
//
// P0.4 / finding #8 fix (2026-04-18): the previous pure-regex approach
// was substring-scanned and matched the "3.0" inside "1.3.0a3", firing
// release_major on pre-release alphas. We now normalize the tag (strip
// "v"/"release-"/"release/" prefix) and require the remainder to be
// strictly digits + dots in the shape X.0 or X.0.0. Any letters, hyphens,
// plus signs, or additional digit runs fail the gate.
function isMajorVersionTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  const normalized = tag
    .replace(/^release[-/_]/i, "")
    .replace(/^v(?=\d)/i, "");
  // Reject pre-release (alpha/beta/rc/dev/pre), build metadata (+sha),
  // or any other non-version-number suffix.
  if (/[^0-9.]/.test(normalized)) return false;
  // Must be exactly X.0 or X.0.0 with nothing else.
  return /^\d+\.0(\.0)?$/.test(normalized);
}

// ---------------------------------------------------------------------------
// Detector helpers
// ---------------------------------------------------------------------------

function confidenceFromRatio(ratio: number, highAt: number, mediumAt: number): "high" | "medium" | "low" {
  if (ratio >= highAt) return "high";
  if (ratio >= mediumAt) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

export function detectReleaseRecent(input: ReasonInput, now: number = Date.now()): ReasonDetail | null {
  const { repo } = input;
  const days = daysSince(repo.lastReleaseAt, now);
  if (days === null || days < 0 || days > 7) return null;

  const tag = repo.lastReleaseTag ?? "a new release";
  const tf = formatTimeframe(repo.lastReleaseAt, now);
  const confidence: "high" | "medium" | "low" = days <= 2 ? "high" : days <= 5 ? "medium" : "low";

  return {
    code: "release_recent",
    headline: `Shipped ${tag} ${tf}`,
    detail: `${repo.name} published ${tag} within the last week, which often drives fresh attention and stars.`,
    confidence,
    timeframe: tf,
    evidence: [
      { label: "Release tag", value: tag },
      { label: "Released", value: tf },
      { label: "Days since release", value: Number(days.toFixed(1)) },
    ],
  };
}

export function detectReleaseMajor(input: ReasonInput, now: number = Date.now()): ReasonDetail | null {
  const { repo } = input;
  if (!isMajorVersionTag(repo.lastReleaseTag)) return null;
  const days = daysSince(repo.lastReleaseAt, now);
  if (days === null || days < 0 || days > 14) return null;

  const tag = repo.lastReleaseTag ?? "a major release";
  const tf = formatTimeframe(repo.lastReleaseAt, now);

  return {
    code: "release_major",
    headline: `Shipped ${tag} ${tf}`,
    detail: `${repo.name} cut a major version (${tag}) in the last two weeks. Major releases typically carry breaking changes and drive a step-change in adoption.`,
    confidence: "high",
    timeframe: tf,
    evidence: [
      { label: "Release tag", value: tag },
      { label: "Released", value: tf },
    ],
  };
}

export function detectStarVelocityUp(input: ReasonInput): ReasonDetail | null {
  const { repo } = input;
  const delta24 = repo.starsDelta24h;
  const delta7 = repo.starsDelta7d;
  if (delta24 <= 20) return null;
  const dailyAvg7d = delta7 / 7;
  if (dailyAvg7d <= 0) return null;
  const ratio = delta24 / dailyAvg7d;
  if (ratio <= 2) return null;

  const confidence = confidenceFromRatio(ratio, 4, 2.5);
  return {
    code: "star_velocity_up",
    headline: `Star velocity up ${ratio.toFixed(1)}x vs weekly average`,
    detail: `${repo.name} gained ${formatInt(delta24)} stars in the last 24h — ${ratio.toFixed(1)}x its 7-day daily average of ${formatInt(dailyAvg7d)}.`,
    confidence,
    timeframe: "24h",
    evidence: [
      { label: "Stars gained (24h)", value: delta24 },
      { label: "7d daily average", value: Number(dailyAvg7d.toFixed(1)) },
      { label: "Acceleration", value: `${ratio.toFixed(1)}x` },
    ],
  };
}

export function detectStarSpike(input: ReasonInput): ReasonDetail | null {
  const { repo } = input;
  if (repo.stars <= 50) return null;
  const delta = repo.starsDelta24h;
  if (delta <= 0) return null;
  const pct = delta / repo.stars;
  if (pct <= 0.05) return null;

  const confidence: "high" | "medium" | "low" = pct > 0.1 ? "high" : "medium";
  const pctLabel = `${(pct * 100).toFixed(1)}%`;
  return {
    code: "star_spike",
    headline: `Gained ${formatInt(delta)} stars in 24h (${pctLabel} of total)`,
    detail: `${repo.name} gained ${formatInt(delta)} stars in 24h — ${pctLabel} of its ${formatInt(repo.stars)} total. That's an unusual single-day spike.`,
    confidence,
    timeframe: "24h",
    evidence: [
      { label: "Stars gained (24h)", value: delta },
      { label: "Total stars", value: repo.stars },
      { label: "Share of total", value: pctLabel },
    ],
  };
}

export function detectForkVelocityUp(input: ReasonInput): ReasonDetail | null {
  const { repo } = input;
  if (repo.forks <= 10) return null;
  const delta = repo.forksDelta7d;
  if (delta <= 50) return null;

  const rate = delta / Math.max(1, repo.forks);
  const confidence = confidenceFromRatio(rate, 0.1, 0.03);
  return {
    code: "fork_velocity_up",
    headline: `${formatInt(delta)} new forks this week`,
    detail: `${repo.name} added ${formatInt(delta)} forks over the last 7 days. Fork acceleration often signals teams integrating or evaluating the project.`,
    confidence,
    timeframe: "7d",
    evidence: [
      { label: "Forks gained (7d)", value: delta },
      { label: "Total forks", value: repo.forks },
    ],
  };
}

export function detectContributorGrowth(input: ReasonInput): ReasonDetail | null {
  const { repo } = input;
  const delta = repo.contributorsDelta30d;
  if (delta <= 2) return null;

  return {
    code: "contributor_growth",
    headline: `${formatInt(delta)} new contributors in 30 days`,
    detail: `${repo.name} added ${formatInt(delta)} new contributors over the last 30 days, a sign the community is expanding.`,
    confidence: "medium",
    timeframe: "30d",
    evidence: [
      { label: "New contributors (30d)", value: delta },
      { label: "Total contributors", value: repo.contributors },
    ],
  };
}

export function detectCommitFresh(input: ReasonInput, now: number = Date.now()): ReasonDetail | null {
  const { repo } = input;
  const days = daysSince(repo.lastCommitAt, now);
  if (days === null || days < 0 || days > 1) return null;

  const tf = formatTimeframe(repo.lastCommitAt, now);
  return {
    code: "commit_fresh",
    headline: `Last commit ${tf}`,
    detail: `${repo.name} has commits landing in the last 24 hours, indicating active ongoing development.`,
    confidence: "low",
    timeframe: tf,
    evidence: [
      { label: "Last commit", value: tf },
    ],
  };
}

export function detectRankJump(input: ReasonInput): ReasonDetail | null {
  const { repo, previousRank } = input;
  if (previousRank === undefined) return null;
  const jump = previousRank - repo.rank;
  if (jump <= 5) return null;

  const confidence = confidenceFromRatio(jump, 25, 12);
  return {
    code: "rank_jump",
    headline: `Climbed ${jump} ranks to #${repo.rank}`,
    detail: `${repo.name} jumped from #${previousRank} to #${repo.rank} — a ${jump}-place climb on the momentum leaderboard.`,
    confidence,
    timeframe: "recent",
    evidence: [
      { label: "Previous rank", value: previousRank },
      { label: "Current rank", value: repo.rank },
      { label: "Places gained", value: jump },
    ],
  };
}

export function detectCategoryTop(input: ReasonInput): ReasonDetail | null {
  const { repo, categoryTopId } = input;
  if (!categoryTopId || categoryTopId !== repo.id) return null;

  return {
    code: "category_top",
    headline: `#1 mover in ${repo.categoryId}`,
    detail: `${repo.name} is now the top mover in its category (${repo.categoryId}) by momentum score.`,
    confidence: "high",
    timeframe: "today",
    evidence: [
      { label: "Category", value: repo.categoryId },
      { label: "Category rank", value: repo.categoryRank },
    ],
  };
}

export function detectHackerNewsFrontPage(input: ReasonInput): ReasonDetail | null {
  const agg = input.socialAggregate;
  if (!agg) return null;
  const hnCount = agg.platformBreakdown.hackernews ?? 0;
  if (hnCount <= 2) return null;

  return {
    code: "hacker_news_front_page",
    headline: `${hnCount} Hacker News mentions in 24h`,
    detail: `${input.repo.name} has ${hnCount} Hacker News discussions in the last 24 hours — typically a front-page-level signal.`,
    confidence: "high",
    timeframe: "24h",
    evidence: [
      { label: "HN mentions (24h)", value: hnCount },
      { label: "Total mentions (24h)", value: agg.mentionCount24h },
    ],
  };
}

export function detectViralSocialPost(input: ReasonInput): ReasonDetail | null {
  const agg = input.socialAggregate;
  if (!agg) return null;
  if (agg.influencerMentions <= 0) return null;
  if (agg.totalReach <= 50_000) return null;

  const confidence: "high" | "medium" | "low" = agg.totalReach >= 250_000 ? "high" : "medium";
  return {
    code: "viral_social_post",
    headline: `High-reach mention (~${formatInt(agg.totalReach)} impressions)`,
    detail: `${input.repo.name} was mentioned by ${agg.influencerMentions} influencer${agg.influencerMentions === 1 ? "" : "s"} reaching an estimated ${formatInt(agg.totalReach)} people.`,
    confidence,
    timeframe: "recent",
    evidence: [
      { label: "Influencer mentions", value: agg.influencerMentions },
      { label: "Total reach", value: agg.totalReach },
    ],
  };
}

export function detectSocialBuzzElevated(input: ReasonInput): ReasonDetail | null {
  const { repo, socialAggregate } = input;
  if (repo.socialBuzzScore <= 60) return null;
  if (repo.mentionCount24h <= 3) return null;

  const platforms = socialAggregate
    ? Object.entries(socialAggregate.platformBreakdown)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k]) => k)
    : [];
  const platformLabel = platforms.length > 0 ? platforms.join(", ") : "multiple platforms";

  return {
    code: "social_buzz_elevated",
    headline: `${repo.mentionCount24h} mentions across ${platformLabel}`,
    detail: `${repo.name} has sustained chatter across ${platformLabel} — buzz score ${repo.socialBuzzScore}/100.`,
    confidence: "medium",
    timeframe: "24h",
    evidence: [
      { label: "Mentions (24h)", value: repo.mentionCount24h },
      { label: "Buzz score", value: repo.socialBuzzScore },
    ],
  };
}

export function detectIssueActivitySpike(input: ReasonInput, now: number = Date.now()): ReasonDetail | null {
  const { repo } = input;
  if (repo.openIssues <= 100) return null;
  const ageDays = daysSince(repo.createdAt, now);
  if (ageDays === null || ageDays >= 730) return null; // only for projects < 2 years old

  return {
    code: "issue_activity_spike",
    headline: `${formatInt(repo.openIssues)} open issues on a young project`,
    detail: `${repo.name} has ${formatInt(repo.openIssues)} open issues despite being only ${Math.round(ageDays)} days old — heavy issue traffic often signals rapid real-world adoption.`,
    confidence: "low",
    timeframe: "ongoing",
    evidence: [
      { label: "Open issues", value: repo.openIssues },
      { label: "Project age (days)", value: Math.round(ageDays) },
    ],
  };
}

export function detectBreakout(input: ReasonInput): ReasonDetail | null {
  if (!input.isBreakout) return null;
  const { repo } = input;

  return {
    code: "breakout_detected",
    headline: `Breakout: small repo, unusual acceleration`,
    detail: `${repo.name} has ${formatInt(repo.stars)} stars but is accelerating 3x its normal pace — the classic breakout pattern before a repo goes mainstream.`,
    confidence: "high",
    timeframe: "recent",
    evidence: [
      { label: "Total stars", value: repo.stars },
      { label: "Stars gained (24h)", value: repo.starsDelta24h },
      { label: "Stars gained (7d)", value: repo.starsDelta7d },
    ],
  };
}

export function detectQuietKiller(input: ReasonInput): ReasonDetail | null {
  if (!input.isQuietKiller) return null;
  const { repo } = input;

  return {
    code: "quiet_killer_detected",
    headline: `Steady accumulation without a spike`,
    detail: `${repo.name} has been quietly accumulating stars — ${formatInt(repo.starsDelta7d)} this week with no single viral moment. Classic quiet-killer behavior.`,
    confidence: "medium",
    timeframe: "7d",
    evidence: [
      { label: "Stars gained (7d)", value: repo.starsDelta7d },
      { label: "Stars gained (30d)", value: repo.starsDelta30d },
    ],
  };
}

// ---------------------------------------------------------------------------
// Organic-growth fallback — NOT a regular detector; called by the generator
// only when nothing else fires and the repo is still trending up.
// ---------------------------------------------------------------------------

export function buildOrganicGrowthReason(input: ReasonInput): ReasonDetail {
  const { repo } = input;
  return {
    code: "organic_growth",
    headline: `+${formatInt(repo.starsDelta7d)} stars this week, no single trigger`,
    detail: `${repo.name} is gaining stars steadily with no clear catalyst — organic word-of-mouth accumulation.`,
    confidence: "low",
    timeframe: "7d",
    evidence: [
      { label: "Stars gained (7d)", value: repo.starsDelta7d },
      { label: "Stars gained (30d)", value: repo.starsDelta30d },
    ],
  };
}

// ---------------------------------------------------------------------------
// Registry: all regular detectors, in arbitrary order.
// The generator sorts results by REASON_METADATA priority after collection.
// ---------------------------------------------------------------------------

export type Detector = (input: ReasonInput, now?: number) => ReasonDetail | null;

export const ALL_DETECTORS: Detector[] = [
  detectReleaseRecent,
  detectReleaseMajor,
  detectStarVelocityUp,
  detectStarSpike,
  detectForkVelocityUp,
  detectContributorGrowth,
  detectCommitFresh,
  detectRankJump,
  detectCategoryTop,
  detectHackerNewsFrontPage,
  detectViralSocialPost,
  detectSocialBuzzElevated,
  detectIssueActivitySpike,
  detectBreakout,
  detectQuietKiller,
];

/** Exported so callers/tests can sanity-check we have a detector per code. */
export const DETECTOR_CODES: ReasonCode[] = [
  "release_recent",
  "release_major",
  "star_velocity_up",
  "star_spike",
  "fork_velocity_up",
  "contributor_growth",
  "commit_fresh",
  "rank_jump",
  "category_top",
  "hacker_news_front_page",
  "viral_social_post",
  "social_buzz_elevated",
  "issue_activity_spike",
  "breakout_detected",
  "quiet_killer_detected",
];
