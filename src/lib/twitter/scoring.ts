/**
 * @internal
 * Twitter scoring kernel — consumed only by ./service.ts.
 * Public surface is exposed via ./builder.ts (TwitterSignalBuilder).
 * Do not import from outside src/lib/twitter/.
 */
import { clamp } from "@/lib/utils";
import { repoNameNeedsStrongContext } from "./query-bundle";
import type {
  TwitterBadgeDecision,
  TwitterMatchedPost,
  TwitterMatchedPostPreview,
  TwitterRepoInput,
  TwitterRepoMetrics,
  TwitterRepoRowBadge,
  TwitterScoreBreakdown,
} from "./types";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const EXACT_MATCHES = new Set(["url", "repo_slug", "package_name"]);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function confidenceRank(level: TwitterMatchedPost["confidence"]): number {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

export function engagementForTwitterPost(post: TwitterMatchedPost): number {
  return post.likes + post.reposts + post.replies + post.quotes;
}

function hasStrongSupportingContext(
  repo: TwitterRepoInput,
  post: TwitterMatchedPost,
): boolean {
  const context = new Set(
    (post.supportingContext ?? []).map((value) => value.trim().toLowerCase()),
  );
  if (
    context.has("owner") ||
    context.has("repo_slug") ||
    context.has("package_name") ||
    context.has("homepage") ||
    context.has("docs") ||
    context.has("github_url")
  ) {
    return true;
  }

  const owner = repo.ownerName.trim().toLowerCase();
  const fullName = repo.githubFullName.trim().toLowerCase();
  const packages = new Set((repo.packageNames ?? []).map((value) => value.toLowerCase()));
  const terms = new Set(post.matchedTerms.map((value) => value.trim().toLowerCase()));

  if (terms.has(owner) || terms.has(fullName)) return true;
  for (const pkg of packages) {
    if (terms.has(pkg)) return true;
  }
  return false;
}

function sanitizePost(post: TwitterMatchedPost): TwitterMatchedPost | null {
  const postedMs = Date.parse(post.postedAt);
  if (!post.postId || !post.postUrl || !Number.isFinite(postedMs)) return null;

  return {
    ...post,
    authorHandle: post.authorHandle.trim() || "unknown",
    postUrl: post.postUrl.trim(),
    text: post.text.trim(),
    likes: Math.max(0, Math.floor(post.likes)),
    reposts: Math.max(0, Math.floor(post.reposts)),
    replies: Math.max(0, Math.floor(post.replies)),
    quotes: Math.max(0, Math.floor(post.quotes)),
    matchedTerms: Array.from(
      new Set(post.matchedTerms.map((value) => value.trim()).filter(Boolean)),
    ),
    whyMatched: post.whyMatched.trim(),
    supportingContext: Array.from(
      new Set((post.supportingContext ?? []).map((value) => value.trim()).filter(Boolean)),
    ),
  };
}

function shouldKeepPost(repo: TwitterRepoInput, post: TwitterMatchedPost): boolean {
  if (
    repoNameNeedsStrongContext(repo) &&
    post.confidence !== "high" &&
    !hasStrongSupportingContext(repo, post)
  ) {
    return false;
  }
  return true;
}

function pickPreferredPost(
  current: TwitterMatchedPost,
  candidate: TwitterMatchedPost,
): TwitterMatchedPost {
  const currentConfidence = confidenceRank(current.confidence);
  const candidateConfidence = confidenceRank(candidate.confidence);
  if (candidateConfidence !== currentConfidence) {
    return candidateConfidence > currentConfidence ? candidate : current;
  }

  const currentEngagement = engagementForTwitterPost(current);
  const candidateEngagement = engagementForTwitterPost(candidate);
  if (candidateEngagement !== currentEngagement) {
    return candidateEngagement > currentEngagement ? candidate : current;
  }

  return Date.parse(candidate.postedAt) > Date.parse(current.postedAt)
    ? candidate
    : current;
}

export function prepareTwitterPosts(
  repo: TwitterRepoInput,
  posts: TwitterMatchedPost[],
): TwitterMatchedPost[] {
  const deduped = new Map<string, TwitterMatchedPost>();

  for (const raw of posts) {
    const post = sanitizePost(raw);
    if (!post) continue;
    if (!shouldKeepPost(repo, post)) continue;

    const key =
      post.canonicalPostId?.trim() ||
      post.postId.trim() ||
      normalizeUrl(post.postUrl) ||
      `${post.authorHandle.toLowerCase()}:${normalizeText(post.text)}`;

    const existing = deduped.get(key);
    deduped.set(key, existing ? pickPreferredPost(existing, post) : post);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const postedDiff = Date.parse(b.postedAt) - Date.parse(a.postedAt);
    if (postedDiff !== 0) return postedDiff;
    return engagementForTwitterPost(b) - engagementForTwitterPost(a);
  });
}

export function computeTwitterMetrics(
  posts: TwitterMatchedPost[],
  completedAt: string,
): TwitterRepoMetrics {
  const completedMs = Date.parse(completedAt);
  const windowStart = completedMs - MS_PER_DAY;
  const hourlyMentions24h = new Array<number>(24).fill(0);
  const hourlyEngagement24h = new Array<number>(24).fill(0);
  const authorCounts = new Map<string, number>();

  let mentionCount24h = 0;
  let totalLikes24h = 0;
  let totalReposts24h = 0;
  let totalReplies24h = 0;
  let totalQuotes24h = 0;
  let confidenceHighCount = 0;
  let confidenceMediumCount = 0;
  let confidenceLowCount = 0;
  let exactMatchCount = 0;
  let topPostEngagement = 0;
  let topPostUrl: string | null = null;

  for (const post of posts) {
    const postedMs = Date.parse(post.postedAt);
    if (!Number.isFinite(postedMs)) continue;
    if (postedMs < windowStart || postedMs > completedMs) continue;

    mentionCount24h += 1;
    totalLikes24h += post.likes;
    totalReposts24h += post.reposts;
    totalReplies24h += post.replies;
    totalQuotes24h += post.quotes;

    const authorKey = post.authorHandle.trim().toLowerCase();
    authorCounts.set(authorKey, (authorCounts.get(authorKey) ?? 0) + 1);

    switch (post.confidence) {
      case "high":
        confidenceHighCount += 1;
        break;
      case "medium":
        confidenceMediumCount += 1;
        break;
      case "low":
        confidenceLowCount += 1;
        break;
    }

    if (EXACT_MATCHES.has(post.matchedBy)) {
      exactMatchCount += 1;
    }

    const engagement = engagementForTwitterPost(post);
    if (engagement > topPostEngagement) {
      topPostEngagement = engagement;
      topPostUrl = post.postUrl;
    }

    const hourIndex = Math.floor((postedMs - windowStart) / MS_PER_HOUR);
    if (hourIndex >= 0 && hourIndex < 24) {
      hourlyMentions24h[hourIndex] += 1;
      hourlyEngagement24h[hourIndex] += engagement;
    }
  }

  const uniqueAuthors24h = authorCounts.size;
  const engagementTotal =
    totalLikes24h + totalReposts24h + totalReplies24h + totalQuotes24h;
  const authorDiversityRatio =
    mentionCount24h > 0 ? uniqueAuthors24h / mentionCount24h : 0;
  const confidenceRatio =
    mentionCount24h > 0
      ? (
          confidenceHighCount +
          confidenceMediumCount * 0.6 +
          confidenceLowCount * 0.25
        ) / mentionCount24h
      : 0;
  const exactMatchRatio =
    mentionCount24h > 0 ? exactMatchCount / mentionCount24h : 0;

  let dominantAuthorShare = 0;
  for (const count of authorCounts.values()) {
    dominantAuthorShare = Math.max(
      dominantAuthorShare,
      mentionCount24h > 0 ? count / mentionCount24h : 0,
    );
  }

  let peakHour24h: string | null = null;
  let peakMentions = 0;
  for (let i = 0; i < hourlyMentions24h.length; i++) {
    if (hourlyMentions24h[i] > peakMentions) {
      peakMentions = hourlyMentions24h[i];
      peakHour24h = new Date(windowStart + i * MS_PER_HOUR).toISOString();
    }
  }

  const recentMentions = hourlyMentions24h
    .slice(Math.max(0, hourlyMentions24h.length - 6))
    .reduce((sum, value) => sum + value, 0);
  const priorMentions = hourlyMentions24h
    .slice(0, Math.max(0, hourlyMentions24h.length - 6))
    .reduce((sum, value) => sum + value, 0);
  const recentRate = recentMentions / 6;
  const priorRate = priorMentions / 18;
  const buzzGrowthIndicator =
    recentMentions === 0 && priorMentions === 0
      ? 0
      : priorRate <= 0
        ? round1(clamp(recentRate, 0, 3))
        : round1(clamp(recentRate / priorRate, 0, 3));

  return {
    mentionCount24h,
    uniqueAuthors24h,
    totalLikes24h,
    totalReposts24h,
    totalReplies24h,
    totalQuotes24h,
    peakHour24h,
    topPostEngagement,
    topPostUrl,
    confidenceHighCount,
    confidenceMediumCount,
    confidenceLowCount,
    engagementTotal,
    authorDiversityRatio: round1(authorDiversityRatio),
    confidenceRatio: round1(confidenceRatio),
    exactMatchRatio: round1(exactMatchRatio),
    buzzGrowthIndicator,
    dominantAuthorShare: round1(dominantAuthorShare),
    hourlyMentions24h,
    hourlyEngagement24h,
  };
}

function logNorm(value: number, cap: number): number {
  if (value <= 0) return 0;
  return clamp(Math.log1p(value) / Math.log1p(cap), 0, 1);
}

export function computeTwitterScore(
  metrics: TwitterRepoMetrics,
): TwitterScoreBreakdown {
  const normalizedMentionCount = logNorm(metrics.mentionCount24h, 20);
  const normalizedUniqueAuthors = logNorm(metrics.uniqueAuthors24h, 10);
  const normalizedTotalReposts = logNorm(metrics.totalReposts24h, 80);
  const normalizedRepliesQuotes = logNorm(
    metrics.totalReplies24h + metrics.totalQuotes24h,
    50,
  );
  const likesCapped = Math.min(
    metrics.totalLikes24h,
    Math.max(metrics.mentionCount24h, 1) * 200,
  );
  const normalizedTotalLikesCapped = logNorm(likesCapped, 400);

  const baseScore =
    100 *
    (0.35 * normalizedMentionCount +
      0.25 * normalizedUniqueAuthors +
      0.2 * normalizedTotalReposts +
      0.1 * normalizedRepliesQuotes +
      0.1 * normalizedTotalLikesCapped);

  const lowShare =
    metrics.mentionCount24h > 0
      ? metrics.confidenceLowCount / metrics.mentionCount24h
      : 1;

  const confidenceBonus =
    metrics.exactMatchRatio * 12 +
    Math.max(metrics.confidenceRatio - 0.45, 0) * 10 +
    (metrics.confidenceHighCount > 0 ? 2 : 0);

  const ambiguityPenalty =
    Math.max(0, 0.15 - metrics.exactMatchRatio) * 35 +
    Math.max(0, 0.5 - metrics.confidenceRatio) * 25 +
    Math.max(0, 0.45 - metrics.authorDiversityRatio) * 20 +
    Math.max(0, lowShare - 0.5) * 18;

  const singleAuthorPenalty =
    metrics.dominantAuthorShare > 0.6
      ? (metrics.dominantAuthorShare - 0.6) * 50
      : 0;

  const finalTwitterScore = clamp(
    baseScore + confidenceBonus - ambiguityPenalty - singleAuthorPenalty,
    0,
    100,
  );

  return {
    normalizedMentionCount: round1(normalizedMentionCount * 100),
    normalizedUniqueAuthors: round1(normalizedUniqueAuthors * 100),
    normalizedTotalReposts: round1(normalizedTotalReposts * 100),
    normalizedRepliesQuotes: round1(normalizedRepliesQuotes * 100),
    normalizedTotalLikesCapped: round1(normalizedTotalLikesCapped * 100),
    baseScore: round1(baseScore),
    confidenceBonus: round1(confidenceBonus),
    ambiguityPenalty: round1(ambiguityPenalty),
    singleAuthorPenalty: round1(singleAuthorPenalty),
    finalTwitterScore: round1(finalTwitterScore),
  };
}

export function decideTwitterBadge(
  metrics: TwitterRepoMetrics,
  score: TwitterScoreBreakdown,
): TwitterBadgeDecision {
  const reasons: string[] = [];
  const hasStrongEvidence =
    metrics.confidenceHighCount >= 1 || metrics.confidenceMediumCount >= 2;

  if (metrics.mentionCount24h < 3) {
    reasons.push("Needs at least 3 matched posts in the last 24h.");
  }
  if (metrics.uniqueAuthors24h < 2) {
    reasons.push("Needs at least 2 distinct authors.");
  }
  if (!hasStrongEvidence) {
    reasons.push("Needs 1 high-confidence or 2 medium-confidence matches.");
  }

  if (reasons.length > 0) {
    return { state: "none", label: null, reason: reasons };
  }

  const breakoutReasons: string[] = [];
  if (metrics.mentionCount24h < 8) {
    breakoutReasons.push("Needs at least 8 matched posts for breakout.");
  }
  if (metrics.uniqueAuthors24h < 4) {
    breakoutReasons.push("Needs at least 4 distinct authors for breakout.");
  }
  if (score.finalTwitterScore < 70) {
    breakoutReasons.push("Needs final Twitter score >= 70.");
  }
  if (metrics.dominantAuthorShare > 0.65) {
    breakoutReasons.push("Too concentrated in one author.");
  }
  if (metrics.exactMatchRatio < 0.2) {
    breakoutReasons.push("Needs more exact URL/slug/package evidence.");
  }
  if (
    !(metrics.confidenceHighCount >= 2 ||
      (metrics.confidenceHighCount >= 1 &&
        metrics.confidenceMediumCount >= 3))
  ) {
    breakoutReasons.push("Needs stronger high-confidence coverage.");
  }

  if (breakoutReasons.length === 0) {
    return {
      state: "x_fire",
      label: "X🔥",
      reason: [
        "Breakout on X in the last 24h.",
        `${metrics.mentionCount24h} matched posts across ${metrics.uniqueAuthors24h} authors.`,
      ],
    };
  }

  return {
    state: "x",
    label: "X",
    reason: [
      "Meaningful X activity confirmed.",
      `${metrics.mentionCount24h} matched posts across ${metrics.uniqueAuthors24h} authors.`,
    ],
  };
}

export function buildTwitterPostPreviews(
  posts: TwitterMatchedPost[],
  completedAt: string,
  limit = 5,
): TwitterMatchedPostPreview[] {
  const completedMs = Date.parse(completedAt);
  const windowStart = completedMs - MS_PER_DAY;

  return posts
    .filter((post) => {
      const postedMs = Date.parse(post.postedAt);
      return Number.isFinite(postedMs) && postedMs >= windowStart && postedMs <= completedMs;
    })
    .slice()
    .sort((a, b) => {
      const engagementDiff =
        engagementForTwitterPost(b) - engagementForTwitterPost(a);
      if (engagementDiff !== 0) return engagementDiff;
      return Date.parse(b.postedAt) - Date.parse(a.postedAt);
    })
    .slice(0, Math.max(0, limit))
    .map((post) => ({
      postId: post.postId,
      postUrl: post.postUrl,
      authorHandle: post.authorHandle,
      authorAvatarUrl: post.authorAvatarUrl ?? null,
      postedAt: post.postedAt,
      text: post.text,
      engagement: engagementForTwitterPost(post),
      confidence: post.confidence,
      matchedBy: post.matchedBy,
      whyMatched: post.whyMatched,
    }));
}

export function buildTwitterRowBadge(
  badge: TwitterBadgeDecision,
  metrics: TwitterRepoMetrics,
  score: TwitterScoreBreakdown,
): TwitterRepoRowBadge {
  const tooltip = badge.reason.join(" ");
  return {
    state: badge.state,
    label: badge.label,
    showBadge: badge.state !== "none",
    isBreakout: badge.state === "x_fire",
    tooltip,
    mentionCount24h: metrics.mentionCount24h,
    uniqueAuthors24h: metrics.uniqueAuthors24h,
    finalTwitterScore: score.finalTwitterScore,
  };
}
