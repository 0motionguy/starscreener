export type TwitterScanTrigger =
  | "trending_pipeline"
  | "manual_drop"
  | "review_queue"
  | "scheduled_refresh";

export type TwitterScanStatus = "completed" | "partial" | "failed";

export type TwitterQueryType =
  | "repo_slug"
  | "repo_url"
  | "homepage_url"
  | "docs_url"
  | "package_name"
  | "project_name"
  | "repo_short_name"
  | "owner_project_phrase"
  | "alias";

export type TwitterQueryTier = 1 | 2 | 3;

export type TwitterMatchBy =
  | "url"
  | "repo_slug"
  | "package_name"
  | "phrase"
  | "alias";

export type TwitterConfidence = "high" | "medium" | "low";

export type TwitterBadgeState = "none" | "x" | "x_fire";

export type TwitterSignalSource = "twitter";

export type TwitterScanType = "targeted_repo_scan";

export interface TwitterRepoInput {
  repoId: string;
  githubFullName: string;
  githubUrl: string;
  repoName: string;
  ownerName: string;
  homepageUrl?: string | null;
  docsUrl?: string | null;
  packageNames?: string[];
  aliases?: string[];
  description?: string | null;
}

export interface TwitterQuery {
  queryText: string;
  queryType: TwitterQueryType;
  tier: TwitterQueryTier;
  confidenceWeight: number;
  enabled: boolean;
  rationale?: string;
  matchCount?: number | null;
}

export interface TwitterMatchedPost {
  postId: string;
  postUrl: string;
  canonicalPostId?: string | null;
  authorHandle: string;
  authorId?: string | null;
  authorAvatarUrl?: string | null;
  postedAt: string;
  text: string;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  authorFollowers?: number | null;
  isRepost?: boolean;
  matchedBy: TwitterMatchBy;
  confidence: TwitterConfidence;
  matchedTerms: string[];
  whyMatched: string;
  supportingContext?: string[];
  sourceQuery: string;
  sourceQueryType: TwitterQueryType;
}

export interface TwitterMatchedPostPreview {
  postId: string;
  postUrl: string;
  authorHandle: string;
  authorAvatarUrl?: string | null;
  postedAt: string;
  text: string;
  engagement: number;
  confidence: TwitterConfidence;
  matchedBy: TwitterMatchBy;
  whyMatched: string;
}

export interface TwitterMentionAuthorBubble {
  authorHandle: string;
  avatarUrl?: string | null;
  profileUrl: string;
  postUrl: string;
  engagement: number;
}

export interface TwitterScanCandidate {
  priorityRank: number;
  priorityScore: number;
  priorityReason: string;
  lastScannedAt: string | null;
  repo: TwitterRepoInput;
}

export interface TwitterRepoMetrics {
  mentionCount24h: number;
  uniqueAuthors24h: number;
  totalLikes24h: number;
  totalReposts24h: number;
  totalReplies24h: number;
  totalQuotes24h: number;
  peakHour24h: string | null;
  topPostEngagement: number;
  topPostUrl: string | null;
  confidenceHighCount: number;
  confidenceMediumCount: number;
  confidenceLowCount: number;
  engagementTotal: number;
  authorDiversityRatio: number;
  confidenceRatio: number;
  exactMatchRatio: number;
  buzzGrowthIndicator: number;
  dominantAuthorShare: number;
  hourlyMentions24h: number[];
  hourlyEngagement24h: number[];
}

export interface TwitterScoreBreakdown {
  normalizedMentionCount: number;
  normalizedUniqueAuthors: number;
  normalizedTotalReposts: number;
  normalizedRepliesQuotes: number;
  normalizedTotalLikesCapped: number;
  baseScore: number;
  confidenceBonus: number;
  ambiguityPenalty: number;
  singleAuthorPenalty: number;
  finalTwitterScore: number;
}

export interface TwitterBadgeDecision {
  state: TwitterBadgeState;
  label: string | null;
  reason: string[];
}

export interface TwitterAgentDescriptor {
  name: string;
  version: string;
  runId: string;
}

export interface TwitterRawSummary {
  candidatePostsSeen: number;
  acceptedPosts: number;
  rejectedPosts: number;
  rateLimited?: boolean;
  timeoutHit?: boolean;
  challengeDetected?: boolean;
}

export interface TwitterObservedMetricsHint {
  mentionCount24h?: number;
  uniqueAuthors24h?: number;
  totalLikes24h?: number;
  totalReposts24h?: number;
  totalReplies24h?: number;
  totalQuotes24h?: number;
  finalTwitterScore?: number;
}

export interface TwitterObservedBadgeHint {
  state: TwitterBadgeState;
  reason: string;
}

export interface TwitterObservedHints {
  metrics?: TwitterObservedMetricsHint;
  badge?: TwitterObservedBadgeHint;
  topPostIds?: string[];
}

export interface TwitterIngestScan {
  scanId: string;
  scanType: TwitterScanType;
  triggeredBy: TwitterScanTrigger;
  windowHours: number;
  startedAt: string;
  completedAt: string;
  status: TwitterScanStatus;
}

export interface TwitterIngestRequest {
  version: "v1";
  source: TwitterSignalSource;
  agent: TwitterAgentDescriptor;
  repo: TwitterRepoInput;
  scan: TwitterIngestScan;
  queries?: TwitterQuery[];
  posts: TwitterMatchedPost[];
  rawSummary: TwitterRawSummary;
  observed?: TwitterObservedHints;
}

export interface TwitterIngestCounts {
  queriesStored: number;
  postsReceived: number;
  postsAccepted: number;
  postsRejected: number;
  postsInserted: number;
  postsUpdated: number;
}

export interface TwitterComputedSummary {
  mentionCount24h: number;
  uniqueAuthors24h: number;
  totalLikes24h: number;
  totalReposts24h: number;
  totalReplies24h: number;
  totalQuotes24h: number;
  engagementTotal: number;
  finalTwitterScore: number;
  badgeState: TwitterBadgeState;
  lastScannedAt: string;
  topPostUrl: string | null;
}

export interface TwitterIngestResponse {
  ok: true;
  version: "v1";
  ingestionId: string;
  idempotentReplay: boolean;
  repo: {
    repoId: string;
    githubFullName: string;
  };
  scan: {
    scanId: string;
    status: TwitterScanStatus;
    summaryPromoted: boolean;
  };
  counts: TwitterIngestCounts;
  computed: TwitterComputedSummary;
}

export interface TwitterApiErrorDetail {
  path: string;
  message: string;
}

export interface TwitterIngestionAuditLog {
  ingestionId: string;
  version: "v1";
  source: TwitterSignalSource;
  scanId: string;
  repoId: string;
  githubFullName: string;
  authenticatedPrincipal: string;
  agentName: string;
  agentVersion: string;
  agentRunId: string;
  payloadHash: string;
  scanStatus: TwitterScanStatus;
  summaryPromoted: boolean;
  queriesStored: number;
  postsReceived: number;
  postsAccepted: number;
  postsRejected: number;
  postsInserted: number;
  postsUpdated: number;
  computed: TwitterComputedSummary;
  createdAt: string;
}

export interface OpenClawTwitterFindingsPayload {
  version: "v1";
  scanId: string;
  scanStatus: TwitterScanStatus;
  scanTriggeredBy: TwitterScanTrigger;
  scanWindowHours?: number;
  startedAt: string;
  completedAt: string;
  repo: TwitterRepoInput;
  queries?: TwitterQuery[];
  posts: TwitterMatchedPost[];
}

export interface TwitterScanRecord {
  version: "v1";
  source: TwitterSignalSource;
  ingestionId: string;
  payloadHash: string;
  agent: TwitterAgentDescriptor;
  authenticatedPrincipal: string;
  scanId: string;
  scanType: TwitterScanType;
  scanStatus: TwitterScanStatus;
  scanTriggeredBy: TwitterScanTrigger;
  scanWindowHours: number;
  startedAt: string;
  completedAt: string;
  ingestedAt: string;
  repo: TwitterRepoInput;
  queries: TwitterQuery[];
  posts: TwitterMatchedPost[];
  rawSummary: TwitterRawSummary;
  observed?: TwitterObservedHints;
  counts: TwitterIngestCounts;
  metrics: TwitterRepoMetrics;
  score: TwitterScoreBreakdown;
  badge: TwitterBadgeDecision;
}

export interface TwitterRepoRowBadge {
  state: TwitterBadgeState;
  label: string | null;
  showBadge: boolean;
  isBreakout: boolean;
  tooltip: string;
  mentionCount24h: number;
  uniqueAuthors24h: number;
  finalTwitterScore: number;
}

export interface TwitterRepoSignal {
  repoId: string;
  githubFullName: string;
  githubUrl: string;
  repoName: string;
  ownerName: string;
  homepageUrl?: string | null;
  docsUrl?: string | null;
  latestScanId: string;
  latestScanStatus: TwitterScanStatus;
  updatedAt: string;
  metrics: TwitterRepoMetrics;
  score: TwitterScoreBreakdown;
  badge: TwitterBadgeDecision;
  rowBadge: TwitterRepoRowBadge;
  topPosts: TwitterMatchedPostPreview[];
  topMentionAuthors: TwitterMentionAuthorBubble[];
}

export interface TwitterLeaderboardRow {
  repoId: string;
  repoName: string;
  githubFullName: string;
  githubUrl: string;
  homepageUrl?: string | null;
  docsUrl?: string | null;
  trendingRank?: number;
  stars?: number;
  starsDelta24h?: number;
  starsDelta7d?: number;
  momentumScore?: number;
  categoryId?: string;
  ownerAvatarUrl?: string;
  mentionCount24h: number;
  uniqueAuthors24h: number;
  totalLikes24h: number;
  totalReposts24h: number;
  finalTwitterScore: number;
  badgeState: TwitterBadgeState;
  topPostUrl: string | null;
  lastScannedAt: string;
  topMentionAuthors: TwitterMentionAuthorBubble[];
}

export interface TwitterRepoPanel {
  repo: {
    repoId: string;
    githubFullName: string;
    githubUrl: string;
    repoName: string;
    ownerName: string;
    homepageUrl?: string | null;
    docsUrl?: string | null;
  };
  rowBadge: TwitterRepoRowBadge;
  summary: {
    mentionCount24h: number;
    uniqueAuthors24h: number;
    engagementTotal24h: number;
    peakHour24h: string | null;
    topPostUrl: string | null;
    finalTwitterScore: number;
    badgeState: TwitterBadgeState;
    lastScannedAt: string;
  };
  confidenceSummary: {
    highCount: number;
    mediumCount: number;
    lowCount: number;
    confidenceRatio: number;
    exactMatchRatio: number;
    authorDiversityRatio: number;
    dominantAuthorShare: number;
  };
  topPosts: TwitterMatchedPostPreview[];
}

export interface TwitterAdminReview {
  panel: TwitterRepoPanel;
  latestScan: TwitterScanRecord;
}

export interface TwitterIngestResult {
  ok: true;
  created: boolean;
  updated: boolean;
  signal: TwitterRepoSignal;
  ingestionId: string;
}

export interface TwitterOverviewStats {
  lastScannedAt: string | null;
  reposWithMentions: number;
  badgedRepos: number;
  breakoutRepos: number;
  scansStored: number;
  totalMentions24h: number;
  totalLikes24h: number;
  totalReposts24h: number;
  topRepoFullName: string | null;
  topRepoScore: number | null;
}
