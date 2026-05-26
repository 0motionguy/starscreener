// GET  /api/repos/[owner]/[name]/comments
//      Public read. Returns the latest comments on the repo profile page,
//      newest first, with PII stripped — display name + avatar only, no
//      Clerk userId on the wire.
//
// POST /api/repos/[owner]/[name]/comments
//      Signed-in only. Appends one comment row to the JSONL log under the
//      caller's Clerk identity (display name + avatar are snapshotted from
//      the Clerk profile at write time so a later Clerk handle change
//      doesn't rewrite history).
//
// Auth: getUser() — we deliberately do NOT use requireUser() because that
// helper calls `redirect("/sign-in")` which throws an internal Next error
// from a JSON API route. For an API caller we want a clean 401 envelope.
// The signed-in-only contract is enforced inline.
//
// Rate limit: per-user (subject = profile.id), 30/min on POST. Mirrors
// /api/ideas/[id]/contributions which writes the analogous JSONL.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getOptionalUser } from "@/lib/auth/server";
import {
  appendComment,
  listCommentsForRepo,
  type RepoComment,
} from "@/lib/repo-comments";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_BODY = 4000;
const MIN_BODY = 1;

// Strip the raw Clerk userId before returning on the wire. The avatar /
// display name are the only identity bits a public viewer should see.
type PublicRepoComment = Omit<RepoComment, "clerkUserId" | "deletedAt">;

function toPublicComment(c: RepoComment): PublicRepoComment {
  return {
    id: c.id,
    repoFullName: c.repoFullName,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    body: c.body,
    createdAt: c.createdAt,
  };
}

const CommentsPostSchema = z.object({
  body: z
    .string()
    .min(MIN_BODY, `body must be at least ${MIN_BODY} character`)
    .max(MAX_BODY, `body must be at most ${MAX_BODY} characters`),
});

// 30/min mirrors /api/ideas/[id]/contributions — well above any human
// cadence (one every 2s) while keeping a determined flooder out. Each
// append rewrites no file, but the log + lock contention still scale
// linearly so a cap is justified.
const COMMENTS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const GET_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
} as const;

const POST_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

interface RouteContext {
  params: Promise<{ owner: string; name: string }>;
}

interface CommentsListResponse {
  ok: true;
  comments: PublicRepoComment[];
}

interface CommentsCreateResponse {
  ok: true;
  /**
   * The author's own record on POST — returns the full RepoComment
   * (incl. clerkUserId) so the caller can correlate their own write.
   * Their identity is theirs to know; the public list endpoint stays
   * stripped.
   */
  comment: RepoComment;
}

function isValidSlug(owner: string, name: string): boolean {
  return SLUG_PART_PATTERN.test(owner) && SLUG_PART_PATTERN.test(name);
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { owner, name } = await context.params;
  if (!isValidSlug(owner, name)) {
    return NextResponse.json(errorEnvelope("invalid repo slug"), {
      status: 400,
      headers: POST_CACHE_HEADERS,
    });
  }

  try {
    const comments = await listCommentsForRepo(`${owner}/${name}`);
    const body: CommentsListResponse = {
      ok: true,
      comments: comments.map(toPublicComment),
    };
    return NextResponse.json(body, { headers: GET_CACHE_HEADERS });
  } catch (err) {
    return serverError(err, { scope: "[repos/:owner/:name/comments:GET]" });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { owner, name } = await context.params;
  if (!isValidSlug(owner, name)) {
    return NextResponse.json(errorEnvelope("invalid repo slug"), {
      status: 400,
      headers: POST_CACHE_HEADERS,
    });
  }

  try {
    // Shape-validate BEFORE auth so malformed payloads always get a 400,
    // even from anonymous callers. parseBody is a pure schema check —
    // no storage hit yet, so leaking "your body shape is wrong" to anon
    // callers is fine and makes the API contract symmetric.
    const parsed = await parseBody(request, CommentsPostSchema);
    if (!parsed.ok) return parsed.response;

    const trimmed = parsed.data.body.trim();
    if (trimmed.length < MIN_BODY) {
      return NextResponse.json(
        errorEnvelope("body must not be empty after trimming"),
        { status: 400, headers: POST_CACHE_HEADERS },
      );
    }

    // getOptionalUser swallows the "Clerk can't detect middleware" error
    // (which `getUser` throws in dev / CI envs without the middleware)
    // and returns null. Unauthenticated AND middleware-missing both
    // collapse to 401 — the client can't post either way.
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json(
        errorEnvelope("sign in to post a comment", "UNAUTHENTICATED"),
        { status: 401, headers: POST_CACHE_HEADERS },
      );
    }

    const rate = await checkRateLimitAsync(request, {
      ...COMMENTS_RATE_LIMIT,
      subject: user.profile.id,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        errorEnvelope(
          "rate limit exceeded — try again shortly",
          "RATE_LIMITED",
        ),
        {
          status: 429,
          headers: {
            ...POST_CACHE_HEADERS,
            "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          },
        },
      );
    }

    const repoFullName = `${owner}/${name}`;
    const comment = await appendComment({
      repoFullName,
      clerkUserId: user.clerkUserId,
      displayName:
        user.profile.displayName ?? user.profile.handle ?? "anonymous",
      avatarUrl: user.profile.avatarUrl ?? null,
      body: trimmed,
    });

    // Revalidate the profile page so the new comment shows on the next
    // visit. Best-effort — a failure here shouldn't 500 the write.
    try {
      revalidatePath(`/repo/${owner}/${name}`);
    } catch (revalErr) {
      console.warn(
        "[repos/:owner/:name/comments:POST] revalidatePath failed",
        revalErr,
      );
    }

    const body: CommentsCreateResponse = { ok: true, comment };
    return NextResponse.json(body, {
      status: 201,
      headers: POST_CACHE_HEADERS,
    });
  } catch (err) {
    return serverError(err, { scope: "[repos/:owner/:name/comments:POST]" });
  }
}
