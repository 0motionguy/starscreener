// GET /api/repos/[owner]/[name]/mentions?source=&cursor=&limit=
//
// Paginated evidence feed for a single repo. The profile page server-renders
// a capped 50-per-source slice of mentions (see buildMentions in
// src/app/repo/[owner]/[name]/page.tsx); this endpoint is the standalone
// "load more" / external-consumer path that walks the full persisted set
// without the SSR cap.
//
// Pagination is cursor-based over `(postedAt desc, id desc)` — stable across
// re-ingests because both the store's sort and the cursor shape include
// `id` as the deterministic tiebreaker. Cursors are opaque base64url JSON
// so callers can't hand-roll unstable values; malformed cursors 400.
//
// Filtering: `?source=` narrows to one SocialPlatform. Unknown values 400
// rather than silently returning an empty set — silent narrowing hides
// typos on the consumer side.
//
// Cache: Cache-Control: public, s-maxage=30, stale-while-revalidate=60 so
// the edge can absorb spiky page fan-out without hitting origin per page.

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

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
import type {
  MentionPageCursor,
} from "@/lib/pipeline/storage/memory-stores";
import type { SocialPlatform } from "@/lib/types";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

const MENTIONS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

const PAGE_DEFAULT_LIMIT = 50;
const PAGE_MAX_LIMIT = 200;

// Must stay in sync with the SocialPlatform union in src/lib/types.ts.
// Keeping it as an explicit runtime set rather than deriving from the type
// lets us 400 with a precise list when consumers typo a platform name.
const ALLOWED_SOURCES: ReadonlySet<SocialPlatform> = new Set<SocialPlatform>([
  "reddit",
  "hackernews",
  "bluesky",
  "twitter",
  "devto",
  "github",
  "producthunt",
  "lobsters",
  "npm",
  "huggingface",
  "arxiv",
]);

interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

function sortMentionsNewestFirst(a: RepoMention, b: RepoMention): number {
  if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function applyCursor(
  mentions: RepoMention[],
  cursor: MentionPageCursor | undefined,
): RepoMention[] {
  if (!cursor) return mentions;
  return mentions.filter((m) => {
    if (m.postedAt < cursor.postedAt) return true;
    if (m.postedAt > cursor.postedAt) return false;
    return m.id < cursor.id;
  });
}

async function buildUnifiedMentions(fullName: string, repoId: string): Promise<RepoMention[]> {
  const [twitter, productHunt] = await Promise.all([
    getTwitterRepoPanel(fullName),
    Promise.resolve(getLaunchForRepo(fullName)),
  ]);
  const nowIso = new Date().toISOString();
  const out: RepoMention[] = [];

  for (const post of twitter?.topPosts ?? []) {
    const confidence =
      post.confidence === "high" ? 1.0 : post.confidence === "medium" ? 0.6 : 0.3;
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
      confidence: 1.0,
      matchReason: "github_repo_field",
      normalizedUrl: productHunt.url,
    });
  }

  const lobstersStories = getLobstersMentions(fullName)?.stories ?? [];
  for (const story of lobstersStories) {
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
      confidence: 1.0,
      matchReason: story.linkedRepos?.[0]?.matchType ?? "url_link",
      normalizedUrl: story.url,
    });
  }

  const npmPackages = getNpmPackagesForRepo(fullName);
  for (const pkg of npmPackages) {
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
      confidence: 1.0,
      matchReason: "linked_repo_field",
      normalizedUrl: pkg.npmUrl,
    });
  }

  const hfModels = getHfTrendingFile().models ?? [];
  const linkedHf = getDerivedRepoByFullName(fullName)?.linkedHfModels ?? [];
  const hfById = new Map(hfModels.map((m) => [m.id, m]));
  for (const modelId of linkedHf) {
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
      confidence: 1.0,
      matchReason: "cross_domain_join",
      normalizedUrl: model.url,
    });
  }

  const arxivPapers = getArxivRecentFile().papers ?? [];
  const linkedArxiv = new Set(
    (getDerivedRepoByFullName(fullName)?.linkedArxivIds ?? []).map((id) =>
      id.replace(/v\d+$/i, ""),
    ),
  );
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
      confidence: 1.0,
      matchReason: "paper_citation",
      normalizedUrl: paper.absUrl,
    });
  }

  return out;
}

function errorResponse(
  error: string,
  status: number,
  code?: string,
): NextResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = code ? { ok: false, error, code } : { ok: false, error };
  return NextResponse.json(body, { status });
}

/**
 * base64url → JSON → MentionPageCursor. Returns null on any malformed step
 * so the caller can map that uniformly to a 400. Accepts both "base64url"
 * (the canonical form we emit) and plain "base64" so consumers who hand-roll
 * the decode in a language without URL-safe helpers still round-trip.
 */
function decodeCursor(raw: string): MentionPageCursor | null {
  if (raw.length === 0) return null;
  try {
    // `Buffer.from(str, "base64url")` accepts URL-safe and padded input.
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    if (!decoded) return null;
    const parsed: unknown = JSON.parse(decoded);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { postedAt?: unknown }).postedAt !== "string" ||
      typeof (parsed as { id?: unknown }).id !== "string"
    ) {
      return null;
    }
    const { postedAt, id } = parsed as { postedAt: string; id: string };
    // postedAt must be an ISO-parseable timestamp — rejects garbage that
    // happens to survive base64 decoding.
    if (Number.isNaN(Date.parse(postedAt))) return null;
    return { postedAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: MentionPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  Sentry.setTag("route", "api/repos/[owner]/[name]/mentions");

  const { owner, name } = await params;

  // --- 1. Slug validation ----------------------------------------------------
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return errorResponse("Invalid repo slug", 400, "invalid_slug");
  }

  Sentry.setTag("repo", `${owner}/${name}`);

  // --- 2. Query parameter parsing (fails fast with 400) ----------------------
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get("source");
  const limitParam = url.searchParams.get("limit");
  const cursorParam = url.searchParams.get("cursor");

  let source: SocialPlatform | undefined;
  if (sourceParam !== null) {
    if (!ALLOWED_SOURCES.has(sourceParam as SocialPlatform)) {
      return errorResponse(
        `Invalid source. Allowed: ${Array.from(ALLOWED_SOURCES).join(", ")}`,
        400,
        "invalid_source",
      );
    }
    source = sourceParam as SocialPlatform;
  }

  let limit = PAGE_DEFAULT_LIMIT;
  if (limitParam !== null) {
    // Only accept a plain integer — parseInt would quietly eat "50abc".
    if (!/^-?\d+$/.test(limitParam)) {
      return errorResponse(
        "Invalid limit: must be an integer 1..200",
        400,
        "invalid_limit",
      );
    }
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > PAGE_MAX_LIMIT) {
      return errorResponse(
        `Invalid limit: must be an integer 1..${PAGE_MAX_LIMIT}`,
        400,
        "invalid_limit",
      );
    }
    limit = parsed;
  }

  let cursor: MentionPageCursor | undefined;
  if (cursorParam !== null && cursorParam !== "") {
    const decoded = decodeCursor(cursorParam);
    if (decoded === null) {
      return errorResponse("Invalid cursor", 400, "invalid_cursor");
    }
    cursor = decoded;
  }

  // --- 3. Repo resolution ----------------------------------------------------
  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    return errorResponse("Repo not found", 404, "repo_not_found");
  }

  // --- 4. Hydrate from disk so cold-start Lambdas see persisted mentions.
  // ensureReady() is idempotent; subsequent calls are ~free.
  try {
    await pipeline.ensureReady();
  } catch (err) {
    console.error("[api:mentions] pipeline.ensureReady failed", err);
    Sentry.captureException(err, {
      tags: {
        route: "api/repos/[owner]/[name]/mentions",
        phase: "ensureReady",
        repo: repo.fullName,
      },
    });
    // Don't fail the request — fall through with an empty store.
  }

  // --- 5. Store read ---------------------------------------------------------
  // Defensive try/catch so internal errors never leak a stack trace via the
  // response body — map to a generic 500 with a stable shape.
  try {
    const baseMentions = mentionStore.listForRepo(repo.id);
    const unifiedMentions = await buildUnifiedMentions(repo.fullName, repo.id);
    const merged = [...baseMentions, ...unifiedMentions].sort(sortMentionsNewestFirst);
    const scoped = source ? merged.filter((m) => m.platform === source) : merged;
    const afterCursor = applyCursor(scoped, cursor);
    const items = afterCursor.slice(0, limit);
    const hasMore = afterCursor.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor({
            postedAt: items[items.length - 1].postedAt,
            id: items[items.length - 1].id,
          })
        : null;

    return respondWithSizeGuard(
      {
        ok: true,
        fetchedAt: new Date().toISOString(),
        repo: repo.fullName,
        count: items.length,
        nextCursor,
        items,
      },
      {
        headers: MENTIONS_CACHE_HEADERS,
        route: "/api/repos/[owner]/[name]/mentions",
        arrayKeys: ["items"],
      },
    );
  } catch (err) {
    console.error(
      `[api:mentions] store read failed for ${repo.fullName}`,
      err,
    );
    Sentry.captureException(err, {
      tags: {
        route: "api/repos/[owner]/[name]/mentions",
        phase: "store_read",
        repo: repo.fullName,
        ...(source ? { source } : {}),
      },
      extra: { limit, hasCursor: cursor !== undefined },
    });
    return errorResponse("Internal error", 500, "internal_error");
  }
}
