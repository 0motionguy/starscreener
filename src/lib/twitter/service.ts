import { createHash } from "node:crypto";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getRepoMetadata, listRepoMetadata } from "@/lib/repo-metadata";
import { slugToId } from "@/lib/utils";
import { buildTwitterQueryBundle } from "./query-bundle";
import { toTwitterIngestRequestFromLegacy } from "./ingest-contract";
import {
  buildTwitterPostPreviews,
  buildTwitterRowBadge,
  computeTwitterMetrics,
  computeTwitterScore,
  decideTwitterBadge,
  engagementForTwitterPost,
  prepareTwitterPosts,
} from "./scoring";
import {
  ensureTwitterReady,
  twitterStore,
} from "./storage";
import type { Repo } from "@/lib/types";
import type {
  OpenClawTwitterFindingsPayload,
  TwitterAdminReview,
  TwitterAgentDescriptor,
  TwitterApiErrorDetail,
  TwitterComputedSummary,
  TwitterIngestCounts,
  TwitterIngestRequest,
  TwitterIngestResponse,
  TwitterIngestResult,
  TwitterIngestionAuditLog,
  TwitterLeaderboardRow,
  TwitterMatchedPostPreview,
  TwitterMentionAuthorBubble,
  TwitterObservedBadgeHint,
  TwitterObservedHints,
  TwitterObservedMetricsHint,
  TwitterOverviewStats,
  TwitterQuery,
  TwitterQueryType,
  TwitterRawSummary,
  TwitterRepoInput,
  TwitterRepoPanel,
  TwitterRepoSignal,
  TwitterScanCandidate,
  TwitterScanRecord,
} from "./types";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SCAN_REFRESH_HOURS = 6;

const QUERY_RATIONALES: Record<TwitterQueryType, string> = {
  repo_slug: "Exact GitHub repo slug",
  repo_url: "Exact GitHub repo URL",
  homepage_url: "Exact project homepage URL",
  docs_url: "Exact project docs URL",
  package_name: "Exact package name",
  project_name: "Quoted project name",
  repo_short_name: "Quoted repo short name",
  owner_project_phrase: "Owner plus project phrase",
  alias: "Alias fallback",
};

class TwitterIngestError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  details?: TwitterApiErrorDetail[];

  constructor(
    code: string,
    message: string,
    status: number,
    retryable: boolean,
    details?: TwitterApiErrorDetail[],
  ) {
    super(message);
    this.name = "TwitterIngestError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

interface ResolvedIngestResult {
  response: TwitterIngestResponse;
  signal: TwitterRepoSignal;
  created: boolean;
  updated: boolean;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim().toLowerCase());
    u.hostname = u.hostname.replace(/^www\./, "");
    u.protocol = "https:";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    // Drop search params and hash for canonical comparison
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

// Recursive stable serializer used for payload hashing. Bounded depth +
// cycle detection prevent OOM on hostile/cyclic ingest payloads — without
// these, a Twitter ingest with a deep object graph could exhaust the heap
// before the hash even completes (LIB-12 in TECH_DEBT_AUDIT.md).
const STABLE_STRINGIFY_MAX_DEPTH = 32;
const STABLE_STRINGIFY_TRUNCATED = '"__truncated__"';

function stableStringify(value: unknown, depth = 0, seen?: WeakSet<object>): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (depth >= STABLE_STRINGIFY_MAX_DEPTH) {
    return STABLE_STRINGIFY_TRUNCATED;
  }

  // Lazy WeakSet allocation — avoids cost when the typical small payload
  // never recurses past depth 1 or 2.
  const cycleGuard = seen ?? new WeakSet<object>();
  const obj = value as object;
  if (cycleGuard.has(obj)) {
    return STABLE_STRINGIFY_TRUNCATED;
  }
  cycleGuard.add(obj);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, depth + 1, cycleGuard)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry) => entry[1] !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested, depth + 1, cycleGuard)}`)
    .join(",")}}`;
}

function createPayloadHash(payload: TwitterIngestRequest): string {
  return createHash("sha256")
    .update(stableStringify(payload))
    .digest("hex");
}

function createIngestionId(scanId: string): string {
  const digest = createHash("sha256")
    .update(`twitter:${scanId}`)
    .digest("hex")
    .slice(0, 24);
  return `twi_${digest}`;
}

function normalizeObservedMetricsHint(
  metrics: TwitterObservedMetricsHint | undefined,
): TwitterObservedMetricsHint | undefined {
  if (!metrics) return undefined;
  return {
    mentionCount24h:
      metrics.mentionCount24h === undefined
        ? undefined
        : Math.max(0, Math.floor(metrics.mentionCount24h)),
    uniqueAuthors24h:
      metrics.uniqueAuthors24h === undefined
        ? undefined
        : Math.max(0, Math.floor(metrics.uniqueAuthors24h)),
    totalLikes24h:
      metrics.totalLikes24h === undefined
        ? undefined
        : Math.max(0, Math.floor(metrics.totalLikes24h)),
    totalReposts24h:
      metrics.totalReposts24h === undefined
        ? undefined
        : Math.max(0, Math.floor(metrics.totalReposts24h)),
    totalReplies24h:
      metrics.totalReplies24h === undefined
        ? undefined
        : Math.max(0, Math.floor(metrics.totalReplies24h)),
    totalQuotes24h:
      metrics.totalQuotes24h === undefined
        ? undefined
        : Math.max(0, Math.floor(metrics.totalQuotes24h)),
    finalTwitterScore:
      metrics.finalTwitterScore === undefined
        ? undefined
        : Math.max(0, Math.min(100, metrics.finalTwitterScore)),
  };
}

function normalizeObservedBadgeHint(
  badge: TwitterObservedBadgeHint | undefined,
): TwitterObservedBadgeHint | undefined {
  if (!badge) return undefined;
  return {
    state: badge.state,
    reason: badge.reason.trim(),
  };
}

function normalizeObservedHints(
  observed: TwitterObservedHints | undefined,
): TwitterObservedHints | undefined {
  if (!observed) return undefined;

  const normalized: TwitterObservedHints = {};
  const metrics = normalizeObservedMetricsHint(observed.metrics);
  const badge = normalizeObservedBadgeHint(observed.badge);
  const topPostIds = observed.topPostIds
    ? Array.from(
        new Set(observed.topPostIds.map((value) => value.trim()).filter(Boolean)),
      )
    : undefined;

  if (metrics && Object.values(metrics).some((value) => value !== undefined)) {
    normalized.metrics = metrics;
  }
  if (badge) {
    normalized.badge = badge;
  }
  if (topPostIds && topPostIds.length > 0) {
    normalized.topPostIds = topPostIds;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRawSummary(
  rawSummary: TwitterRawSummary,
): TwitterRawSummary {
  return {
    candidatePostsSeen: Math.max(0, Math.floor(rawSummary.candidatePostsSeen)),
    acceptedPosts: Math.max(0, Math.floor(rawSummary.acceptedPosts)),
    rejectedPosts: Math.max(0, Math.floor(rawSummary.rejectedPosts)),
    rateLimited: Boolean(rawSummary.rateLimited),
    timeoutHit: Boolean(rawSummary.timeoutHit),
    challengeDetected: Boolean(rawSummary.challengeDetected),
  };
}

function normalizeTwitterQuery(query: TwitterQuery): TwitterQuery {
  return {
    queryText: query.queryText.trim(),
    queryType: query.queryType,
    tier: query.tier,
    confidenceWeight: Math.max(0, Math.min(1, query.confidenceWeight)),
    enabled: Boolean(query.enabled),
    rationale:
      query.rationale?.trim() || QUERY_RATIONALES[query.queryType] || "Agent-supplied query",
    matchCount:
      query.matchCount === undefined || query.matchCount === null
        ? null
        : Math.max(0, Math.floor(query.matchCount)),
  };
}

function normalizeRepoInput(repo: TwitterRepoInput): TwitterRepoInput {
  return {
    ...repo,
    repoId: repo.repoId.trim() || slugToId(repo.githubFullName),
    githubFullName: repo.githubFullName.trim(),
    githubUrl: repo.githubUrl.trim(),
    repoName: repo.repoName.trim(),
    ownerName: repo.ownerName.trim(),
    homepageUrl: repo.homepageUrl?.trim() || null,
    docsUrl: repo.docsUrl?.trim() || null,
    packageNames: Array.from(
      new Set((repo.packageNames ?? []).map((value) => value.trim()).filter(Boolean)),
    ),
    aliases: Array.from(
      new Set((repo.aliases ?? []).map((value) => value.trim()).filter(Boolean)),
    ),
    description: repo.description?.trim() || null,
  };
}

function getTwitterHandle(authorHandle: string): string {
  return authorHandle.trim().replace(/^@+/, "");
}

function getTwitterProfileUrl(authorHandle: string): string {
  const handle = getTwitterHandle(authorHandle);
  return `https://x.com/${encodeURIComponent(handle)}`;
}

function getFallbackTwitterAvatarUrl(authorHandle: string): string | null {
  const handle = getTwitterHandle(authorHandle);
  return handle ? `https://unavatar.io/twitter/${encodeURIComponent(handle)}` : null;
}

function normalizeIngestRequest(payload: TwitterIngestRequest): TwitterIngestRequest {
  const agent: TwitterAgentDescriptor = {
    name: payload.agent.name.trim(),
    version: payload.agent.version.trim(),
    runId: payload.agent.runId.trim(),
  };

  return {
    version: "v1",
    source: "twitter",
    agent,
    repo: normalizeRepoInput(payload.repo),
    scan: {
      scanId: payload.scan.scanId.trim(),
      scanType: "targeted_repo_scan",
      triggeredBy: payload.scan.triggeredBy,
      windowHours: Math.max(1, Math.min(168, Math.floor(payload.scan.windowHours))),
      startedAt: payload.scan.startedAt,
      completedAt: payload.scan.completedAt,
      status: payload.scan.status,
    },
    queries: payload.queries?.map(normalizeTwitterQuery),
    posts: payload.posts.map((post) => ({
      ...post,
      postId: post.postId.trim(),
      canonicalPostId: post.canonicalPostId?.trim() || null,
      postUrl: post.postUrl.trim(),
      authorHandle: post.authorHandle.trim(),
      authorId: post.authorId?.trim() || null,
      authorAvatarUrl: post.authorAvatarUrl?.trim() || null,
      postedAt: post.postedAt,
      text: post.text.trim(),
      likes: Math.max(0, Math.floor(post.likes)),
      reposts: Math.max(0, Math.floor(post.reposts)),
      replies: Math.max(0, Math.floor(post.replies)),
      quotes: Math.max(0, Math.floor(post.quotes)),
      authorFollowers:
        post.authorFollowers === undefined || post.authorFollowers === null
          ? null
          : Math.max(0, Math.floor(post.authorFollowers)),
      isRepost: Boolean(post.isRepost),
      matchedBy: post.matchedBy,
      confidence: post.confidence,
      matchedTerms: Array.from(
        new Set(post.matchedTerms.map((value) => value.trim()).filter(Boolean)),
      ),
      whyMatched: post.whyMatched.trim(),
      supportingContext: Array.from(
        new Set((post.supportingContext ?? []).map((value) => value.trim()).filter(Boolean)),
      ),
      sourceQuery: post.sourceQuery.trim(),
      sourceQueryType: post.sourceQueryType,
    })),
    rawSummary: normalizeRawSummary(payload.rawSummary),
    observed: normalizeObservedHints(payload.observed),
  };
}

function ensureRepoIdentity(repo: TwitterRepoInput): void {
  const normalizedFullName = repo.githubFullName.toLowerCase();
  const metadata = getRepoMetadata(repo.githubFullName);
  const storedSignalById = twitterStore.getRepoSignal(repo.repoId);
  const storedSignalByFullName = twitterStore.getRepoSignalByFullName(repo.githubFullName);

  if (
    metadata &&
    metadata.url &&
    normalizeUrl(metadata.url) !== normalizeUrl(repo.githubUrl)
  ) {
    throw new TwitterIngestError(
      "REPO_IDENTITY_MISMATCH",
      "githubUrl does not match the stored canonical repository URL",
      422,
      false,
      [{ path: "repo.githubUrl", message: "githubUrl must match the stored repository URL" }],
    );
  }

  if (
    storedSignalById &&
    storedSignalById.githubFullName.toLowerCase() !== normalizedFullName
  ) {
    throw new TwitterIngestError(
      "REPO_IDENTITY_MISMATCH",
      "repoId already belongs to a different GitHub repository in Twitter signals",
      409,
      false,
      [{ path: "repo.repoId", message: "repoId is already used for a different githubFullName" }],
    );
  }

  if (
    storedSignalByFullName &&
    storedSignalByFullName.repoId !== repo.repoId
  ) {
    throw new TwitterIngestError(
      "REPO_IDENTITY_MISMATCH",
      "githubFullName is already associated with a different repoId in Twitter signals",
      409,
      false,
      [{ path: "repo.githubFullName", message: "githubFullName is already mapped to a different repoId" }],
    );
  }
}

function buildTopMentionAuthorsFromPosts(
  posts: TwitterScanRecord["posts"],
  completedAt: string,
  limit = 5,
): TwitterMentionAuthorBubble[] {
  const completedMs = Date.parse(completedAt);
  const windowStart = completedMs - TWENTY_FOUR_HOURS_MS;
  const authors = new Map<string, TwitterMentionAuthorBubble>();

  for (const post of posts
    .filter((candidate) => {
      const postedMs = Date.parse(candidate.postedAt);
      return Number.isFinite(postedMs) && postedMs >= windowStart && postedMs <= completedMs;
    })
    .slice()
    .sort((a, b) => {
      const engagementDiff = engagementForTwitterPost(b) - engagementForTwitterPost(a);
      if (engagementDiff !== 0) return engagementDiff;
      return Date.parse(b.postedAt) - Date.parse(a.postedAt);
    })) {
    const authorHandle = post.authorHandle.trim().replace(/^@+/, "");
    if (!authorHandle) continue;

    const authorKey = authorHandle.toLowerCase();
    if (authors.has(authorKey)) continue;

    authors.set(authorKey, {
      authorHandle,
      avatarUrl: post.authorAvatarUrl ?? getFallbackTwitterAvatarUrl(authorHandle),
      profileUrl: getTwitterProfileUrl(authorHandle),
      postUrl: post.postUrl,
      engagement: engagementForTwitterPost(post),
    });

    if (authors.size >= limit) break;
  }

  return Array.from(authors.values());
}

function buildTopMentionAuthorsFromPreviews(
  previews: TwitterMatchedPostPreview[],
  limit = 5,
): TwitterMentionAuthorBubble[] {
  const authors = new Map<string, TwitterMentionAuthorBubble>();

  for (const preview of previews) {
    const authorHandle = preview.authorHandle.trim().replace(/^@+/, "");
    if (!authorHandle) continue;

    const authorKey = authorHandle.toLowerCase();
    if (authors.has(authorKey)) continue;

    authors.set(authorKey, {
      authorHandle,
      avatarUrl: preview.authorAvatarUrl ?? getFallbackTwitterAvatarUrl(authorHandle),
      profileUrl: getTwitterProfileUrl(authorHandle),
      postUrl: preview.postUrl,
      engagement: preview.engagement,
    });

    if (authors.size >= limit) break;
  }

  return Array.from(authors.values());
}

function hydrateMentionAuthorAvatars(
  authors: TwitterMentionAuthorBubble[],
): TwitterMentionAuthorBubble[] {
  return authors.map((author) => ({
    ...author,
    avatarUrl:
      author.avatarUrl ?? getFallbackTwitterAvatarUrl(author.authorHandle),
  }));
}

function compareScansByCompletedAtDesc(
  a: TwitterScanRecord,
  b: TwitterScanRecord,
): number {
  const aTime = Date.parse(a.completedAt);
  const bTime = Date.parse(b.completedAt);
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return bTime - aTime;
  }
  return b.ingestedAt.localeCompare(a.ingestedAt);
}

function toRepoSignalFromComputed(
  scan: TwitterScanRecord,
  posts: TwitterScanRecord["posts"],
  metrics: TwitterScanRecord["metrics"],
  score: TwitterScanRecord["score"],
  badge: TwitterScanRecord["badge"],
): TwitterRepoSignal {
  const topPosts = buildTwitterPostPreviews(posts, scan.completedAt, 10);
  const rowBadge = buildTwitterRowBadge(badge, metrics, score);

  return {
    repoId: scan.repo.repoId,
    githubFullName: scan.repo.githubFullName,
    githubUrl: scan.repo.githubUrl,
    repoName: scan.repo.repoName,
    ownerName: scan.repo.ownerName,
    homepageUrl: scan.repo.homepageUrl ?? null,
    docsUrl: scan.repo.docsUrl ?? null,
    latestScanId: scan.scanId,
    latestScanStatus: scan.scanStatus,
    updatedAt: scan.completedAt,
    metrics,
    score,
    badge,
    rowBadge,
    topPosts,
    topMentionAuthors: buildTopMentionAuthorsFromPosts(posts, scan.completedAt, 10),
  };
}

function toRepoSignal(scan: TwitterScanRecord): TwitterRepoSignal {
  return toRepoSignalFromComputed(
    scan,
    scan.posts,
    scan.metrics,
    scan.score,
    scan.badge,
  );
}

function buildAggregatedRepoSignal(
  repoId: string,
  fallbackScan: TwitterScanRecord,
): TwitterRepoSignal {
  const scans = twitterStore.listScansForRepo(
    repoId,
    Number.MAX_SAFE_INTEGER,
  );
  const scanPool = scans.some((scan) => scan.scanId === fallbackScan.scanId)
    ? scans
    : [fallbackScan, ...scans];
  const anchor = scanPool.slice().sort(compareScansByCompletedAtDesc)[0] ?? fallbackScan;
  const posts = prepareTwitterPosts(
    anchor.repo,
    scanPool.flatMap((scan) => scan.posts),
  );
  const metrics = computeTwitterMetrics(posts, anchor.completedAt);
  const score = computeTwitterScore(metrics);
  const badge = decideTwitterBadge(metrics, score);

  return toRepoSignalFromComputed(anchor, posts, metrics, score, badge);
}

function toRepoPanel(signal: TwitterRepoSignal): TwitterRepoPanel {
  return {
    repo: {
      repoId: signal.repoId,
      githubFullName: signal.githubFullName,
      githubUrl: signal.githubUrl,
      repoName: signal.repoName,
      ownerName: signal.ownerName,
      homepageUrl: signal.homepageUrl ?? null,
      docsUrl: signal.docsUrl ?? null,
    },
    rowBadge: signal.rowBadge,
    summary: {
      mentionCount24h: signal.metrics.mentionCount24h,
      uniqueAuthors24h: signal.metrics.uniqueAuthors24h,
      engagementTotal24h: signal.metrics.engagementTotal,
      peakHour24h: signal.metrics.peakHour24h,
      topPostUrl: signal.metrics.topPostUrl,
      finalTwitterScore: signal.score.finalTwitterScore,
      badgeState: signal.badge.state,
      lastScannedAt: signal.updatedAt,
    },
    confidenceSummary: {
      highCount: signal.metrics.confidenceHighCount,
      mediumCount: signal.metrics.confidenceMediumCount,
      lowCount: signal.metrics.confidenceLowCount,
      confidenceRatio: signal.metrics.confidenceRatio,
      exactMatchRatio: signal.metrics.exactMatchRatio,
      authorDiversityRatio: signal.metrics.authorDiversityRatio,
      dominantAuthorShare: signal.metrics.dominantAuthorShare,
    },
    topPosts: signal.topPosts,
  };
}

function buildComputedSummaryFromScan(scan: TwitterScanRecord): TwitterComputedSummary {
  return {
    mentionCount24h: scan.metrics.mentionCount24h,
    uniqueAuthors24h: scan.metrics.uniqueAuthors24h,
    totalLikes24h: scan.metrics.totalLikes24h,
    totalReposts24h: scan.metrics.totalReposts24h,
    totalReplies24h: scan.metrics.totalReplies24h,
    totalQuotes24h: scan.metrics.totalQuotes24h,
    engagementTotal: scan.metrics.engagementTotal,
    finalTwitterScore: scan.score.finalTwitterScore,
    badgeState: scan.badge.state,
    lastScannedAt: scan.completedAt,
    topPostUrl: scan.metrics.topPostUrl,
  };
}

function buildResponseFromScan(
  scan: TwitterScanRecord,
  summaryPromoted: boolean,
  idempotentReplay: boolean,
): TwitterIngestResponse {
  return {
    ok: true,
    version: "v1",
    ingestionId: scan.ingestionId,
    idempotentReplay,
    repo: {
      repoId: scan.repo.repoId,
      githubFullName: scan.repo.githubFullName,
    },
    scan: {
      scanId: scan.scanId,
      status: scan.scanStatus,
      summaryPromoted,
    },
    counts: scan.counts,
    computed: buildComputedSummaryFromScan(scan),
  };
}

function buildAuditLog(
  scan: TwitterScanRecord,
  summaryPromoted: boolean,
): TwitterIngestionAuditLog {
  return {
    ingestionId: scan.ingestionId,
    version: "v1",
    source: "twitter",
    scanId: scan.scanId,
    repoId: scan.repo.repoId,
    githubFullName: scan.repo.githubFullName,
    authenticatedPrincipal: scan.authenticatedPrincipal,
    agentName: scan.agent.name,
    agentVersion: scan.agent.version,
    agentRunId: scan.agent.runId,
    payloadHash: scan.payloadHash,
    scanStatus: scan.scanStatus,
    summaryPromoted,
    queriesStored: scan.counts.queriesStored,
    postsReceived: scan.counts.postsReceived,
    postsAccepted: scan.counts.postsAccepted,
    postsRejected: scan.counts.postsRejected,
    postsInserted: scan.counts.postsInserted,
    postsUpdated: scan.counts.postsUpdated,
    computed: buildComputedSummaryFromScan(scan),
    createdAt: scan.ingestedAt,
  };
}

async function ingestTwitterAgentFindingsInternal(
  payload: TwitterIngestRequest,
  authenticatedPrincipal: string,
): Promise<ResolvedIngestResult> {
  await ensureTwitterReady();

  const normalized = normalizeIngestRequest(payload);
  ensureRepoIdentity(normalized.repo);

  const payloadHash = createPayloadHash(normalized);
  const scanId = normalized.scan.scanId;
  const existingScan = twitterStore.getScan(scanId);
  const existingSignal =
    twitterStore.getRepoSignal(normalized.repo.repoId) ??
    twitterStore.getRepoSignalByFullName(normalized.repo.githubFullName);

  if (existingScan) {
    if (existingScan.payloadHash !== payloadHash) {
      throw new TwitterIngestError(
        "IDEMPOTENCY_CONFLICT",
        "scanId already exists with a different payload",
        409,
        false,
      );
    }

    const replaySignal =
      twitterStore.getRepoSignal(existingScan.repo.repoId) ??
      twitterStore.getRepoSignalByFullName(existingScan.repo.githubFullName) ??
      toRepoSignal(existingScan);
    const summaryPromoted = replaySignal.latestScanId === existingScan.scanId;

    return {
      response: buildResponseFromScan(existingScan, summaryPromoted, true),
      signal: replaySignal,
      created: false,
      updated: true,
    };
  }

  const queries =
    normalized.queries && normalized.queries.length > 0
      ? normalized.queries
      : buildTwitterQueryBundle(normalized.repo).map((query) => ({
          ...query,
          matchCount: null,
        }));
  const posts = prepareTwitterPosts(normalized.repo, normalized.posts);
  const metrics = computeTwitterMetrics(posts, normalized.scan.completedAt);
  const score = computeTwitterScore(metrics);
  const badge = decideTwitterBadge(metrics, score);
  const counts: TwitterIngestCounts = {
    queriesStored: queries.length,
    postsReceived: normalized.posts.length,
    postsAccepted: posts.length,
    postsRejected: Math.max(0, normalized.posts.length - posts.length),
    postsInserted: posts.length,
    postsUpdated: 0,
  };

  const scanRecord: TwitterScanRecord = {
    version: "v1",
    source: "twitter",
    ingestionId: createIngestionId(scanId),
    payloadHash,
    agent: normalized.agent,
    authenticatedPrincipal,
    scanId,
    scanType: normalized.scan.scanType,
    scanStatus: normalized.scan.status,
    scanTriggeredBy: normalized.scan.triggeredBy,
    scanWindowHours: normalized.scan.windowHours,
    startedAt: normalized.scan.startedAt,
    completedAt: normalized.scan.completedAt,
    ingestedAt: new Date().toISOString(),
    repo: normalized.repo,
    queries,
    posts,
    rawSummary: normalized.rawSummary,
    observed: normalized.observed,
    counts,
    metrics,
    score,
    badge,
  };

  twitterStore.upsertScan(scanRecord);
  const signal = buildAggregatedRepoSignal(normalized.repo.repoId, scanRecord);
  const summaryPromoted = signal.latestScanId === scanRecord.scanId;

  twitterStore.upsertRepoSignal(signal);
  twitterStore.upsertAuditLog(buildAuditLog(scanRecord, summaryPromoted));
  invalidateTwitterLeaderboardCaches();

  return {
    response: buildResponseFromScan(scanRecord, summaryPromoted, false),
    signal,
    created: !existingSignal,
    updated: Boolean(existingSignal),
  };
}

export async function ingestTwitterAgentFindings(
  payload: TwitterIngestRequest,
  authenticatedPrincipal: string,
): Promise<TwitterIngestResponse> {
  const result = await ingestTwitterAgentFindingsInternal(payload, authenticatedPrincipal);
  return result.response;
}

export async function ingestTwitterFindings(
  payload: OpenClawTwitterFindingsPayload,
): Promise<TwitterIngestResult> {
  const request = toTwitterIngestRequestFromLegacy(payload);
  const result = await ingestTwitterAgentFindingsInternal(request, "legacy_route");

  return {
    ok: true,
    created: result.created,
    updated: result.updated,
    signal: result.signal,
    ingestionId: result.response.ingestionId,
  };
}

export function isTwitterIngestError(value: unknown): value is TwitterIngestError {
  return value instanceof TwitterIngestError;
}

export async function getTwitterRepoSignal(
  fullNameOrRepoId: string,
): Promise<TwitterRepoSignal | null> {
  await ensureTwitterReady();

  const byFullName = twitterStore.getRepoSignalByFullName(fullNameOrRepoId);
  if (byFullName) return byFullName;

  const byRepoId = twitterStore.getRepoSignal(fullNameOrRepoId);
  return byRepoId ?? null;
}

export async function getTwitterRepoPanel(
  fullNameOrRepoId: string,
): Promise<TwitterRepoPanel | null> {
  const signal = await getTwitterRepoSignal(fullNameOrRepoId);
  return signal ? toRepoPanel(signal) : null;
}

export async function getTwitterAdminReview(
  fullNameOrRepoId: string,
): Promise<TwitterAdminReview | null> {
  const signal = await getTwitterRepoSignal(fullNameOrRepoId);
  if (!signal) return null;

  const latestScan = twitterStore.getLatestScanForRepo(signal.repoId);
  if (!latestScan) return null;

  return {
    panel: toRepoPanel(signal),
    latestScan,
  };
}

// LIB-02: dropped the leaderboardCache / trendingRepoLeaderboardCache
// pair. Every upsertRepoSignal during a scan invalidated both caches,
// so the steady-state hit rate was ~0% — the 60s TTL never had a chance
// to settle while ingest was running, and the read path's overhead of
// a sort over an in-memory map (tens to low-hundreds of entries) is
// well under a millisecond. Removing the cache simplifies the
// invalidation contract to "no contract"; recomputation is cheap.
function invalidateTwitterLeaderboardCaches(): void {
  // intentionally empty — kept to avoid churn at the call site (ingest
  // path); will be removed in a follow-up alongside the caller.
}

function toTwitterLeaderboardRow(
  signal: TwitterRepoSignal,
  trendingRepo?: Repo,
): TwitterLeaderboardRow {
  const topMentionAuthors =
    signal.topMentionAuthors && signal.topMentionAuthors.length > 0
      ? hydrateMentionAuthorAvatars(signal.topMentionAuthors)
      : buildTopMentionAuthorsFromPreviews(signal.topPosts);

  return {
    repoId: signal.repoId,
    repoName: signal.repoName,
    githubFullName: signal.githubFullName,
    githubUrl: signal.githubUrl,
    homepageUrl: signal.homepageUrl ?? null,
    docsUrl: signal.docsUrl ?? null,
    trendingRank: trendingRepo?.rank,
    stars: trendingRepo?.stars,
    starsDelta24h: trendingRepo?.starsDelta24h,
    starsDelta7d: trendingRepo?.starsDelta7d,
    momentumScore: trendingRepo?.momentumScore,
    categoryId: trendingRepo?.categoryId,
    ownerAvatarUrl: trendingRepo?.ownerAvatarUrl,
    mentionCount24h: signal.metrics.mentionCount24h,
    uniqueAuthors24h: signal.metrics.uniqueAuthors24h,
    totalLikes24h: signal.metrics.totalLikes24h,
    totalReposts24h: signal.metrics.totalReposts24h,
    finalTwitterScore: signal.score.finalTwitterScore,
    badgeState: signal.badge.state,
    topPostUrl: signal.metrics.topPostUrl,
    lastScannedAt: signal.updatedAt,
    topMentionAuthors,
  };
}

// P0 INCIDENT 2026-05-03: signal.metrics.mentionCount24h is a STORED count
// from when the signal was last scanned, NOT a live recomputation. So a
// 10-day-old signal with mentionCount24h=12 still ranks #1 today, even
// though those mentions are 10 days stale. The leaderboard was showing
// the SAME repo on top for 10 days because the dominant pre-2026-04-23
// signals had high finalTwitterScore values that frozen-in-time.
//
// Filter signals whose `updatedAt` is older than this threshold. 48h gives
// 2× the 3h cron cadence of headroom while ensuring "trending now" actually
// reflects last-day activity, not historical buzz. Tests use fixed past
// timestamps (2026-04-22) so the filter is disabled when we detect we're
// running under the test runner. NODE_ENV alone isn't reliable because
// `tsx --test` doesn't set it; we also sniff npm_lifecycle_event and the
// well-known node-test-runner channel-fd presence.
const TWITTER_FRESHNESS_THRESHOLD_MS = 48 * 60 * 60 * 1000;
const TWITTER_FRESHNESS_FILTER_ENABLED = (() => {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.NODE_ENV === "production") return true;
  // npm sets these when invoked via `npm test` / `npm run test:*`.
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  if (lifecycle === "test" || lifecycle.startsWith("test:")) return false;
  // Node's built-in test runner sets NODE_TEST_CONTEXT (Node ≥ 18.17).
  if (process.env.NODE_TEST_CONTEXT) return false;
  return true;
})();

function isSignalFresh(signal: { updatedAt: string }, nowMs: number): boolean {
  if (!TWITTER_FRESHNESS_FILTER_ENABLED) return true;
  const t = Date.parse(signal.updatedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= TWITTER_FRESHNESS_THRESHOLD_MS;
}

export async function getTwitterLeaderboard(
  limit = 25,
): Promise<TwitterLeaderboardRow[]> {
  await ensureTwitterReady();

  // LIB-02: recomputed on every call. The previous module-level cache
  // was invalidated on every ingest, so the hit rate was ~0%. Sort over
  // an in-memory list of <500 signals is sub-millisecond.
  const nowMs = Date.now();
  return twitterStore
    .listRepoSignals()
    .filter(
      (signal) =>
        signal.metrics.mentionCount24h > 0 && isSignalFresh(signal, nowMs),
    )
    .sort((a, b) => {
      if (b.score.finalTwitterScore !== a.score.finalTwitterScore) {
        return b.score.finalTwitterScore - a.score.finalTwitterScore;
      }
      if (b.metrics.mentionCount24h !== a.metrics.mentionCount24h) {
        return b.metrics.mentionCount24h - a.metrics.mentionCount24h;
      }
      return b.metrics.uniqueAuthors24h - a.metrics.uniqueAuthors24h;
    })
    .slice(0, Math.max(0, limit))
    .map((signal) => toTwitterLeaderboardRow(signal));
}

export async function getTwitterTrendingRepoLeaderboard(
  limit = 25,
): Promise<TwitterLeaderboardRow[]> {
  await ensureTwitterReady();

  // LIB-02: cache dropped (see getTwitterLeaderboard rationale).
  // P0 2026-05-03: drop signals older than 48h (see isSignalFresh rationale).
  const nowMs = Date.now();
  const rows: TwitterLeaderboardRow[] = [];
  const seenRepoIds = new Set<string>();
  const cappedLimit = Math.max(0, limit);
  if (cappedLimit === 0) return rows;

  for (const repo of getDerivedRepos()) {
    const signal =
      twitterStore.getRepoSignal(repo.id) ??
      twitterStore.getRepoSignalByFullName(repo.fullName);

    if (!signal || signal.metrics.mentionCount24h <= 0) continue;
    if (!isSignalFresh(signal, nowMs)) continue;
    if (seenRepoIds.has(signal.repoId)) continue;

    rows.push(toTwitterLeaderboardRow(signal, repo));
    seenRepoIds.add(signal.repoId);

    if (rows.length >= cappedLimit) break;
  }

  return rows;
}

export async function getTwitterScanCandidates(
  limit = 50,
): Promise<TwitterScanCandidate[]> {
  await ensureTwitterReady();

  const now = Date.now();
  const candidates = listRepoMetadata()
    .filter((repo) => repo.fullName && repo.url && !repo.archived && !repo.disabled)
    .map((metadata) => {
      const repoId = slugToId(metadata.fullName);
      const signal =
        twitterStore.getRepoSignal(repoId) ??
        twitterStore.getRepoSignalByFullName(metadata.fullName);
      const lastScannedAt = signal?.updatedAt ?? null;
      const lastScannedMs = lastScannedAt ? Date.parse(lastScannedAt) : NaN;
      const scanAgeHours = Number.isFinite(lastScannedMs)
        ? Math.max(0, (now - lastScannedMs) / (60 * 60 * 1000))
        : Number.POSITIVE_INFINITY;
      const freshnessBoost =
        !lastScannedAt
          ? 200
          : scanAgeHours >= SCAN_REFRESH_HOURS
            ? Math.min(120, scanAgeHours)
            : -50;
      const starWeight = Math.log1p(Math.max(0, metadata.stars)) * 4;
      const pushedMs = Date.parse(metadata.pushedAt || metadata.updatedAt);
      const pushedAgeDays = Number.isFinite(pushedMs)
        ? Math.max(0, (now - pushedMs) / (24 * 60 * 60 * 1000))
        : 999;
      const recentCodeWeight = Math.max(0, 30 - pushedAgeDays);
      const priorityScore = Math.round(
        (freshnessBoost + starWeight + recentCodeWeight) * 10,
      ) / 10;

      return {
        priorityRank: 0,
        priorityScore,
        priorityReason: lastScannedAt
          ? scanAgeHours >= SCAN_REFRESH_HOURS
            ? `known repo; last X scan ${Math.round(scanAgeHours)}h ago`
            : "known repo; recently scanned, lower refresh priority"
          : "known TrendingRepo repo; no X scan yet",
        lastScannedAt,
        repo: {
          repoId,
          githubFullName: metadata.fullName,
          githubUrl: metadata.url,
          repoName: metadata.name,
          ownerName: metadata.owner,
          homepageUrl: null,
          docsUrl: null,
          packageNames: [],
          aliases: [metadata.name],
          description: metadata.description || null,
        },
      } satisfies Omit<TwitterScanCandidate, "priorityRank"> & {
        priorityRank: number;
      };
    })
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return b.repo.githubFullName.localeCompare(a.repo.githubFullName);
    })
    .slice(0, Math.max(0, limit));

  return candidates.map((candidate, index) => ({
    ...candidate,
    priorityRank: index + 1,
  }));
}

export async function getTwitterOverviewStats(): Promise<TwitterOverviewStats> {
  await ensureTwitterReady();
  const signals = twitterStore.listRepoSignals();

  let lastScannedAt: string | null = null;
  let reposWithMentions = 0;
  let badgedRepos = 0;
  let breakoutRepos = 0;
  let totalMentions24h = 0;
  let totalLikes24h = 0;
  let totalReposts24h = 0;
  let topRepoFullName: string | null = null;
  let topRepoScore: number | null = null;

  for (const signal of signals) {
    if (!lastScannedAt || signal.updatedAt > lastScannedAt) {
      lastScannedAt = signal.updatedAt;
    }
    if (signal.metrics.mentionCount24h > 0) reposWithMentions += 1;
    if (signal.badge.state !== "none") badgedRepos += 1;
    if (signal.badge.state === "x_fire") breakoutRepos += 1;
    totalMentions24h += signal.metrics.mentionCount24h;
    totalLikes24h += signal.metrics.totalLikes24h;
    totalReposts24h += signal.metrics.totalReposts24h;

    if (
      topRepoScore === null ||
      signal.score.finalTwitterScore > topRepoScore
    ) {
      topRepoScore = signal.score.finalTwitterScore;
      topRepoFullName = signal.githubFullName;
    }
  }

  return {
    lastScannedAt,
    reposWithMentions,
    badgedRepos,
    breakoutRepos,
    scansStored: twitterStore.scanCount(),
    totalMentions24h,
    totalLikes24h,
    totalReposts24h,
    topRepoFullName,
    topRepoScore,
  };
}

export { buildTwitterQueryBundle };
