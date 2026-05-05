import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { respondWithSizeGuard } from "@/lib/api/response-size";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { getTwitterRepoPanel } from "@/lib/twitter/service";
import { getLaunchForRepo } from "@/lib/producthunt";
import { getLobstersMentions, lobstersStoryHref } from "@/lib/lobsters";
import { getNpmPackagesForRepo } from "@/lib/npm";
import { getHfTrendingFile } from "@/lib/huggingface";
import { getArxivRecentFile } from "@/lib/arxiv";
import { pipeline, mentionStore } from "@/lib/pipeline/pipeline";
import type { RepoMention } from "@/lib/pipeline/types";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
} as const;

const SourceParamSchema = z.enum([
  "all",
  "hn",
  "reddit",
  "twitter",
  "bluesky",
  "devto",
  "github",
  "producthunt",
  "lobsters",
  "npm",
  "huggingface",
  "arxiv",
]);
const SinceParamSchema = z.enum(["24h", "7d", "30d", "all"]);

const QuerySchema = z.object({
  source: SourceParamSchema.default("all"),
  since: SinceParamSchema.default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  after: z.string().min(1).optional(),
});

interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

interface UnifiedMentionItem {
  id: string;
  source: z.infer<typeof SourceParamSchema>;
  url: string;
  title: string;
  snippet: string;
  author: string;
  occurredAt: string;
  repoFullName: string;
}

function errorResponse(error: string, status: number, code?: string): NextResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = code ? { ok: false, error, code } : { ok: false, error };
  return NextResponse.json(body, { status });
}

function sourceFromPlatform(platform: RepoMention["platform"]): z.infer<typeof SourceParamSchema> {
  if (platform === "hackernews") return "hn";
  return platform as z.infer<typeof SourceParamSchema>;
}

function sortMentionsNewestFirst(a: RepoMention, b: RepoMention): number {
  if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function sinceLowerBound(since: z.infer<typeof SinceParamSchema>): number | null {
  const now = Date.now();
  if (since === "24h") return now - 24 * 60 * 60 * 1000;
  if (since === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (since === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function toUnifiedItem(m: RepoMention, repoFullName: string): UnifiedMentionItem {
  const title = m.content.length > 120 ? `${m.content.slice(0, 117)}...` : m.content;
  return {
    id: m.id,
    source: sourceFromPlatform(m.platform),
    url: m.url,
    title,
    snippet: m.content,
    author: m.author,
    occurredAt: m.postedAt,
    repoFullName,
  };
}

async function buildUnifiedMentions(fullName: string, repoId: string): Promise<RepoMention[]> {
  const [twitter, productHunt] = await Promise.all([
    getTwitterRepoPanel(fullName),
    Promise.resolve(getLaunchForRepo(fullName)),
  ]);
  const nowIso = new Date().toISOString();
  const out: RepoMention[] = [];

  for (const post of twitter?.topPosts ?? []) {
    const confidence = post.confidence === "high" ? 1.0 : post.confidence === "medium" ? 0.6 : 0.3;
    out.push({
      id: `twitter-${post.postId}`,
      repoId,
      platform: "twitter",
      author: post.authorHandle,
      authorFollowers: null,
      content: post.text,
      url: post.postUrl,
      sentiment: "neutral",
      engagement: post.engagement ?? 0,
      reach: 0,
      postedAt: post.postedAt,
      discoveredAt: nowIso,
      isInfluencer: false,
      confidence,
      matchReason: post.matchedBy,
      normalizedUrl: post.postUrl,
    });
  }

  if (productHunt) {
    out.push({
      id: `producthunt-${productHunt.id}`,
      repoId,
      platform: "producthunt",
      author: productHunt.makers?.[0]?.username ?? productHunt.name,
      authorFollowers: null,
      content: productHunt.tagline || productHunt.description || productHunt.name,
      url: productHunt.url,
      sentiment: "neutral",
      engagement: (productHunt.votesCount ?? 0) + (productHunt.commentsCount ?? 0),
      reach: 0,
      postedAt: productHunt.createdAt,
      discoveredAt: nowIso,
      isInfluencer: false,
      confidence: 1,
      matchReason: "github_repo_field",
      normalizedUrl: productHunt.url,
    });
  }

  for (const story of getLobstersMentions(fullName)?.stories ?? []) {
    const postedAt =
      typeof story.createdUtc === "number" && Number.isFinite(story.createdUtc)
        ? new Date(story.createdUtc * 1000).toISOString()
        : nowIso;
    out.push({
      id: `lobsters-${story.shortId}`,
      repoId,
      platform: "lobsters",
      author: story.by ?? "",
      authorFollowers: null,
      content: story.title,
      url: story.commentsUrl || lobstersStoryHref(story.shortId),
      sentiment: "neutral",
      engagement: (story.score ?? 0) + (story.commentCount ?? 0),
      reach: 0,
      postedAt,
      discoveredAt: nowIso,
      isInfluencer: false,
      confidence: 1,
      matchReason: story.linkedRepos?.[0]?.matchType ?? "url_link",
      normalizedUrl: story.url,
    });
  }

  for (const pkg of getNpmPackagesForRepo(fullName)) {
    if (!pkg.publishedAt) continue;
    out.push({
      id: `npm-${pkg.name}`,
      repoId,
      platform: "npm",
      author: pkg.name,
      authorFollowers: null,
      content: pkg.description?.trim() ? `${pkg.name} - ${pkg.description}` : pkg.name,
      url: pkg.npmUrl,
      sentiment: "neutral",
      engagement: pkg.discovery?.weeklyDownloads ?? pkg.downloads7d ?? 0,
      reach: 0,
      postedAt: pkg.publishedAt,
      discoveredAt: nowIso,
      isInfluencer: false,
      confidence: 1,
      matchReason: "linked_repo_field",
      normalizedUrl: pkg.npmUrl,
    });
  }

  const linkedRepo = getDerivedRepoByFullName(fullName);
  const hfById = new Map((getHfTrendingFile().models ?? []).map((m) => [m.id, m]));
  for (const modelId of linkedRepo?.linkedHfModels ?? []) {
    const model = hfById.get(modelId);
    if (!model) continue;
    out.push({
      id: `huggingface-${model.id}`,
      repoId,
      platform: "huggingface",
      author: model.author ?? "",
      authorFollowers: null,
      content: model.id,
      url: model.url,
      sentiment: "neutral",
      engagement: (model.likes ?? 0) + (model.downloads ?? 0),
      reach: 0,
      postedAt: model.lastModified || model.createdAt || nowIso,
      discoveredAt: nowIso,
      isInfluencer: false,
      confidence: 1,
      matchReason: "cross_domain_join",
      normalizedUrl: model.url,
    });
  }

  const arxivPapers = getArxivRecentFile().papers ?? [];
  const linkedArxiv = new Set((linkedRepo?.linkedArxivIds ?? []).map((id) => id.replace(/v\d+$/i, "")));
  const lowerFull = fullName.toLowerCase();
  for (const paper of arxivPapers) {
    const bare = paper.arxivId.replace(/v\d+$/i, "");
    if (
      !linkedArxiv.has(bare) &&
      !paper.linkedRepos?.some((r) => r.fullName?.toLowerCase() === lowerFull)
    ) {
      continue;
    }
    if (out.some((m) => m.id === `arxiv-${bare}`)) continue;
    out.push({
      id: `arxiv-${bare}`,
      repoId,
      platform: "arxiv",
      author: paper.authors?.[0] ?? "",
      authorFollowers: null,
      content: paper.title,
      url: paper.absUrl,
      sentiment: "neutral",
      engagement: 0,
      reach: 0,
      postedAt: paper.publishedAt,
      discoveredAt: nowIso,
      isInfluencer: false,
      confidence: 1,
      matchReason: "paper_citation",
      normalizedUrl: paper.absUrl,
    });
  }

  return out;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; name: string }> }) {
  Sentry.setTag("route", "api/repos/[owner]/[name]/mentions");

  const { owner, name } = await params;
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return errorResponse("Invalid repo slug", 400, "invalid_slug");
  }

  const requestUrl = new URL(request.url);
  const raw = {
    source: requestUrl.searchParams.get("source") ?? "all",
    since: requestUrl.searchParams.get("since") ?? "all",
    limit: requestUrl.searchParams.get("limit") ?? "20",
    after: requestUrl.searchParams.get("after") ?? undefined,
  };
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid query", 400, "invalid_query");
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) return errorResponse("Repo not found", 404, "repo_not_found");

  try {
    await pipeline.ensureReady();
  } catch (err) {
    console.error("[api:mentions] pipeline.ensureReady failed", err);
    Sentry.captureException(err);
  }

  try {
    const baseMentions = mentionStore.listForRepo(repo.id);
    const unifiedMentions = await buildUnifiedMentions(repo.fullName, repo.id);
    const merged = [...baseMentions, ...unifiedMentions].sort(sortMentionsNewestFirst);

    const sinceCutoff = sinceLowerBound(parsed.data.since);
    const byTime = sinceCutoff
      ? merged.filter((m) => {
          const t = Date.parse(m.postedAt);
          return Number.isFinite(t) && t >= sinceCutoff;
        })
      : merged;

    const bySource =
      parsed.data.source === "all"
        ? byTime
        : byTime.filter((m) => sourceFromPlatform(m.platform) === parsed.data.source);

    const sourcesBreakdown = byTime.reduce<Record<string, number>>((acc, m) => {
      const src = sourceFromPlatform(m.platform);
      acc[src] = (acc[src] ?? 0) + 1;
      return acc;
    }, {});

    const startIndex = parsed.data.after
      ? bySource.findIndex((m) => m.id === parsed.data.after) + 1
      : 0;
    const sliced = bySource.slice(Math.max(startIndex, 0), Math.max(startIndex, 0) + parsed.data.limit);
    const nextAfter =
      Math.max(startIndex, 0) + parsed.data.limit < bySource.length && sliced.length > 0
        ? sliced[sliced.length - 1].id
        : null;

    const items = sliced.map((m) => toUnifiedItem(m, repo.fullName));

    return respondWithSizeGuard(
      {
        items,
        totalCount: bySource.length,
        sourcesBreakdown,
        nextAfter,
      },
      {
        headers: CACHE_HEADERS,
        route: "/api/repos/[owner]/[name]/mentions",
        arrayKeys: ["items"],
        requestForEtag: request,
      },
    );
  } catch (err) {
    console.error(`[api:mentions] unified mentions failed for ${repo.fullName}`, err);
    Sentry.captureException(err, { tags: { route: "api/repos/[owner]/[name]/mentions" } });
    return errorResponse("Internal error", 500, "internal_error");
  }
}
