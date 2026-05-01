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

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { pipeline, mentionStore } from "@/lib/pipeline/pipeline";
import type {
  MentionPageCursor,
  MentionListOptions,
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
]);

interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
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
  const { owner, name } = await params;

  // --- 1. Slug validation ----------------------------------------------------
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return errorResponse("Invalid repo slug", 400, "invalid_slug");
  }

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
    // Don't fail the request — fall through with an empty store.
  }

  // --- 5. Store read ---------------------------------------------------------
  // Defensive try/catch so internal errors never leak a stack trace via the
  // response body — map to a generic 500 with a stable shape.
  try {
    const opts: MentionListOptions = { limit };
    if (source) opts.source = source;
    if (cursor) opts.cursor = cursor;

    const page = mentionStore.listForRepoPaginated(repo.id, opts);

    return NextResponse.json(
      {
        ok: true,
        fetchedAt: new Date().toISOString(),
        repo: repo.fullName,
        count: page.items.length,
        nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
        items: page.items,
      },
      { headers: MENTIONS_CACHE_HEADERS },
    );
  } catch (err) {
    console.error(
      `[api:mentions] store read failed for ${repo.fullName}`,
      err,
    );
    return errorResponse("Internal error", 500, "internal_error");
  }
}
