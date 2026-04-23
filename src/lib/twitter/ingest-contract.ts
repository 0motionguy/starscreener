import { z } from "zod";
import type {
  OpenClawTwitterFindingsPayload,
  TwitterIngestRequest,
  TwitterQueryType,
} from "./types";

const FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

function isTwitterPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com";
  } catch {
    return false;
  }
}

function isSafeAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "pbs.twimg.com" ||
      host === "abs.twimg.com" ||
      host === "x.com" ||
      host === "www.x.com" ||
      host === "twitter.com" ||
      host === "www.twitter.com" ||
      host === "unavatar.io"
    );
  } catch {
    return false;
  }
}

function isCanonicalGitHubRepoUrl(value: string, fullName: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return false;
    const path = url.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    return path.toLowerCase() === fullName.toLowerCase();
  } catch {
    return false;
  }
}

const QueryTypeSchema = z.enum([
  "repo_slug",
  "repo_url",
  "homepage_url",
  "docs_url",
  "package_name",
  "project_name",
  "repo_short_name",
  "owner_project_phrase",
  "alias",
] satisfies TwitterQueryType[]);

export const TwitterAgentDescriptorSchema = z.object({
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
  runId: z.string().min(1).max(200),
});

export const TwitterRepoInputSchema = z
  .object({
    repoId: z.string().min(1).max(200),
    githubFullName: z.string().regex(FULL_NAME_PATTERN),
    githubUrl: z.string().url(),
    repoName: z.string().min(1).max(120),
    ownerName: z.string().min(1).max(120),
    homepageUrl: z.string().url().nullable().optional(),
    docsUrl: z.string().url().nullable().optional(),
    packageNames: z.array(z.string().min(1).max(120)).max(20).optional(),
    aliases: z.array(z.string().min(1).max(120)).max(20).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .superRefine((repo, ctx) => {
    const [owner, name] = repo.githubFullName.split("/", 2);

    if (repo.ownerName.trim().toLowerCase() !== owner.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerName"],
        message: "ownerName must match githubFullName owner segment",
      });
    }

    if (repo.repoName.trim().toLowerCase() !== name.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repoName"],
        message: "repoName must match githubFullName repo segment",
      });
    }

    if (!isCanonicalGitHubRepoUrl(repo.githubUrl, repo.githubFullName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["githubUrl"],
        message: "githubUrl must be the canonical GitHub repository URL for githubFullName",
      });
    }
  });

export const TwitterQuerySchema = z.object({
  queryText: z.string().min(1).max(500),
  queryType: QueryTypeSchema,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  confidenceWeight: z.number().min(0).max(1),
  enabled: z.boolean(),
  rationale: z.string().min(1).max(500).optional(),
  matchCount: z.number().int().min(0).optional(),
});

export const TwitterMatchedPostSchema = z
  .object({
    postId: z.string().min(1).max(200),
    canonicalPostId: z.string().min(1).max(200).nullable().optional(),
    postUrl: z.string().url(),
    authorHandle: z.string().min(1).max(120),
    authorId: z.string().min(1).max(200).nullable().optional(),
    authorAvatarUrl: z.string().url().nullable().optional(),
    postedAt: z.string().datetime(),
    text: z.string().min(1).max(20_000),
    likes: z.number().int().min(0),
    reposts: z.number().int().min(0),
    replies: z.number().int().min(0),
    quotes: z.number().int().min(0),
    authorFollowers: z.number().int().min(0).nullable().optional(),
    isRepost: z.boolean().optional(),
    matchedBy: z.enum(["url", "repo_slug", "package_name", "phrase", "alias"]),
    confidence: z.enum(["high", "medium", "low"]),
    matchedTerms: z.array(z.string().min(1).max(200)).max(25),
    whyMatched: z.string().min(1).max(2000),
    supportingContext: z.array(z.string().min(1).max(120)).max(25).optional(),
    sourceQuery: z.string().min(1).max(500),
    sourceQueryType: QueryTypeSchema,
  })
  .superRefine((post, ctx) => {
    if (!isTwitterPostUrl(post.postUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postUrl"],
        message: "postUrl must be an x.com or twitter.com URL",
      });
    }

    if (post.authorAvatarUrl && !isSafeAvatarUrl(post.authorAvatarUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorAvatarUrl"],
        message: "authorAvatarUrl must be an HTTPS X/Twitter avatar URL or unavatar.io fallback",
      });
    }
  });

export const TwitterRawSummarySchema = z.object({
  candidatePostsSeen: z.number().int().min(0),
  acceptedPosts: z.number().int().min(0),
  rejectedPosts: z.number().int().min(0),
  rateLimited: z.boolean().optional(),
  timeoutHit: z.boolean().optional(),
  challengeDetected: z.boolean().optional(),
});

export const TwitterObservedHintsSchema = z
  .object({
    metrics: z
      .object({
        mentionCount24h: z.number().int().min(0).optional(),
        uniqueAuthors24h: z.number().int().min(0).optional(),
        totalLikes24h: z.number().int().min(0).optional(),
        totalReposts24h: z.number().int().min(0).optional(),
        totalReplies24h: z.number().int().min(0).optional(),
        totalQuotes24h: z.number().int().min(0).optional(),
        finalTwitterScore: z.number().min(0).max(100).optional(),
      })
      .optional(),
    badge: z
      .object({
        state: z.enum(["none", "x", "x_fire"]),
        reason: z.string().min(1).max(1000),
      })
      .optional(),
    topPostIds: z.array(z.string().min(1).max(200)).max(10).optional(),
  })
  .optional();

export const TwitterIngestRequestSchema = z
  .object({
    version: z.literal("v1"),
    source: z.literal("twitter"),
    agent: TwitterAgentDescriptorSchema,
    repo: TwitterRepoInputSchema,
    scan: z.object({
      scanId: z.string().min(1).max(200),
      scanType: z.literal("targeted_repo_scan"),
      triggeredBy: z.enum([
        "trending_pipeline",
        "manual_drop",
        "review_queue",
        "scheduled_refresh",
      ]),
      windowHours: z.number().int().min(1).max(168),
      startedAt: z.string().datetime(),
      completedAt: z.string().datetime(),
      status: z.enum(["completed", "partial", "failed"]),
    }),
    queries: z.array(TwitterQuerySchema).max(40).optional(),
    posts: z.array(TwitterMatchedPostSchema),
    rawSummary: TwitterRawSummarySchema,
    observed: TwitterObservedHintsSchema,
  })
  .superRefine((payload, ctx) => {
    if (Date.parse(payload.scan.completedAt) < Date.parse(payload.scan.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scan", "completedAt"],
        message: "completedAt must be on or after startedAt",
      });
    }

    if (payload.rawSummary.acceptedPosts !== payload.posts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawSummary", "acceptedPosts"],
        message: "acceptedPosts must equal posts.length",
      });
    }

    if (
      payload.rawSummary.candidatePostsSeen <
      payload.rawSummary.acceptedPosts + payload.rawSummary.rejectedPosts
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawSummary", "candidatePostsSeen"],
        message: "candidatePostsSeen must be >= acceptedPosts + rejectedPosts",
      });
    }

    const postIds = new Set<string>();
    for (const [index, post] of payload.posts.entries()) {
      const normalized = post.postId.trim().toLowerCase();
      if (postIds.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["posts", index, "postId"],
          message: "postId must be unique within the payload",
        });
      }
      postIds.add(normalized);
    }
  });

export const LegacyTwitterFindingsPayloadSchema = z.object({
  version: z.literal("v1"),
  scanId: z.string().min(1).max(200),
  scanStatus: z.enum(["completed", "partial", "failed"]),
  scanTriggeredBy: z.enum([
    "trending_pipeline",
    "manual_drop",
    "review_queue",
    "scheduled_refresh",
  ]),
  scanWindowHours: z.number().int().min(1).max(168).optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  repo: TwitterRepoInputSchema,
  queries: z.array(TwitterQuerySchema).max(40).optional(),
  posts: z.array(TwitterMatchedPostSchema),
});

export function toTwitterIngestRequestFromLegacy(
  payload: OpenClawTwitterFindingsPayload,
): TwitterIngestRequest {
  return {
    version: "v1",
    source: "twitter",
    agent: {
      name: "legacy-openclaw-twitter-agent",
      version: "1.0.0",
      runId: `legacy:${payload.scanId}`,
    },
    repo: payload.repo,
    scan: {
      scanId: payload.scanId,
      scanType: "targeted_repo_scan",
      triggeredBy: payload.scanTriggeredBy,
      windowHours: payload.scanWindowHours ?? 24,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
      status: payload.scanStatus,
    },
    queries: payload.queries,
    posts: payload.posts,
    rawSummary: {
      candidatePostsSeen: payload.posts.length,
      acceptedPosts: payload.posts.length,
      rejectedPosts: 0,
    },
  };
}
