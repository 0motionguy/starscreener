// GET  /api/repos/[owner]/[name]/comments/[commentId]/reactions
//      Public read. Returns the live aggregate (`counts` per reaction)
//      plus `userReaction` — the calling user's currently-active reaction
//      name, or `null` for anonymous viewers / users who haven't reacted.
//
// POST /api/repos/[owner]/[name]/comments/[commentId]/reactions
//      Signed-in only. Toggles the caller's reaction with the requested
//      name on this comment. The toggle helper handles all three cases
//      (add, switch, remove). Returns the post-toggle aggregate.
//
// Auth: getUser() (NOT requireUser, which would redirect for JSON). The
// repoFullName from the slug isn't used to authorise the reaction — the
// commentId is the natural key — but we still validate the slug shape so
// a malformed URL fails fast.
//
// Rate limit: per-user, 60/min on POST. Higher than the comments cap
// because reactions are cheaper (a single appendJsonlFile per toggle).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getOptionalUser } from "@/lib/auth/server";
import {
  ALLOWED_REACTIONS,
  getReactionsForComment,
  toggleReaction,
  type ReactionAggregate,
} from "@/lib/repo-comment-reactions";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const COMMENT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

const ReactionsPostSchema = z.object({
  reaction: z.enum(ALLOWED_REACTIONS),
});

const REACTIONS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

const GET_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
} as const;

const POST_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

interface RouteContext {
  params: Promise<{ owner: string; name: string; commentId: string }>;
}

interface ReactionsResponse extends ReactionAggregate {
  ok: true;
}

function isValidSlug(owner: string, name: string, commentId: string): boolean {
  return (
    SLUG_PART_PATTERN.test(owner) &&
    SLUG_PART_PATTERN.test(name) &&
    COMMENT_ID_PATTERN.test(commentId)
  );
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { owner, name, commentId } = await context.params;
  if (!isValidSlug(owner, name, commentId)) {
    return NextResponse.json(errorEnvelope("invalid slug"), {
      status: 400,
      headers: POST_CACHE_HEADERS,
    });
  }

  try {
    // Public GET: pass null for the user so `userReaction` is null on
    // the wire. We deliberately do NOT call getUser() on GET — it would
    // force the route to dynamic and undermine the s-maxage cache. The
    // client can call POST or hit a separate /me endpoint for personal
    // state; this endpoint is the public aggregate.
    const aggregate = await getReactionsForComment(commentId, null);
    const body: ReactionsResponse = {
      ok: true,
      counts: aggregate.counts,
      userReaction: aggregate.userReaction,
    };
    return NextResponse.json(body, { headers: GET_CACHE_HEADERS });
  } catch (err) {
    return serverError(err, {
      scope: "[repos/:owner/:name/comments/:commentId/reactions:GET]",
    });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { owner, name, commentId } = await context.params;
  if (!isValidSlug(owner, name, commentId)) {
    return NextResponse.json(errorEnvelope("invalid slug"), {
      status: 400,
      headers: POST_CACHE_HEADERS,
    });
  }

  try {
    // Validate shape before auth — symmetric 400/401 ordering with the
    // comments route. parseBody is pure (no storage hit), so leaking
    // schema errors to anon callers is fine.
    const parsed = await parseBody(request, ReactionsPostSchema);
    if (!parsed.ok) return parsed.response;

    // getOptionalUser swallows the "Clerk can't detect middleware"
    // error and returns null when the middleware isn't engaged — same
    // 401 either way.
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json(
        errorEnvelope("sign in to react", "UNAUTHENTICATED"),
        { status: 401, headers: POST_CACHE_HEADERS },
      );
    }

    const rate = await checkRateLimitAsync(request, {
      ...REACTIONS_RATE_LIMIT,
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

    const aggregate = await toggleReaction({
      commentId,
      clerkUserId: user.clerkUserId,
      reaction: parsed.data.reaction,
    });
    const body: ReactionsResponse = {
      ok: true,
      counts: aggregate.counts,
      userReaction: aggregate.userReaction,
    };
    return NextResponse.json(body, { headers: POST_CACHE_HEADERS });
  } catch (err) {
    return serverError(err, {
      scope: "[repos/:owner/:name/comments/:commentId/reactions:POST]",
    });
  }
}
