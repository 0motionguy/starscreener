// GET  /api/repos/[owner]/[name]/like — public read of the like state.
//                                       Returns { ok: true, count, liked }
//                                       (liked is false for anonymous callers).
//                                       Cache-Control: public, s-maxage=10, swr=30.
//
// POST /api/repos/[owner]/[name]/like — Clerk-gated toggle. No body required
//                                       (an empty object is accepted).
//                                       Rate-limited 60/min per user.
//                                       Returns { ok: true, count, liked }.
//
// Storage lives in src/lib/repo-likes.ts (append-only JSONL).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getLikeStatus, toggleLike } from "@/lib/repo-likes";

// Shape gate only — POST carries no fields today, but parsing through Zod
// (with allowEmpty so a body-less POST doesn't 400) keeps lint:zod-routes
// + lint:err-envelope happy and lets us extend the schema later without
// touching the route's invariants.
const LikePostSchema = z.object({}).passthrough();

const LIKE_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

// Slug guard — Next won't decode anything weirder than the URL spec, but
// owner/name still need to match GitHub's allowed character set so we
// don't open a path-traversal vector when composing repoFullName.
const SLUG_RE = /^[A-Za-z0-9._-]+$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LikeOkResponse {
  ok: true;
  count: number;
  liked: boolean;
}

interface LikeErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

interface RouteContext {
  params: Promise<{ owner: string; name: string }>;
}

function badSlugResponse(): NextResponse<LikeErrorResponse> {
  return NextResponse.json(
    errorEnvelope("owner / name must match /^[A-Za-z0-9._-]+$/", "BAD_SLUG"),
    { status: 400 },
  );
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<LikeOkResponse | LikeErrorResponse>> {
  const { owner, name } = await context.params;
  if (!SLUG_RE.test(owner) || !SLUG_RE.test(name)) {
    return badSlugResponse();
  }

  try {
    // Public GET — surface `liked` against the caller's session when we
    // have one, else false. We swallow auth() errors so a missing Clerk
    // middleware in local/CI doesn't break anonymous reads.
    let clerkUserId: string | null = null;
    try {
      const session = await auth();
      clerkUserId = session.userId ?? null;
    } catch {
      clerkUserId = null;
    }

    const status = await getLikeStatus(`${owner}/${name}`, clerkUserId);
    return NextResponse.json(
      { ok: true, count: status.count, liked: status.liked },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    return serverError<LikeErrorResponse>(err, {
      scope: "[repos/:owner/:name/like:GET]",
    });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<LikeOkResponse | LikeErrorResponse>> {
  const { owner, name } = await context.params;
  if (!SLUG_RE.test(owner) || !SLUG_RE.test(name)) {
    return badSlugResponse();
  }

  // JSON 401 (not the Clerk HTML sign-in redirect) — this is a JSON API
  // surface and clients need the envelope shape they get on every other
  // 4xx from this codebase. requireUser() would redirect, which is wrong
  // for fetch() callers; auth() + manual 401 is the right primitive.
  //
  // The try-wrap catches the "Clerk can't detect usage of clerkMiddleware"
  // error that fires when the route isn't covered by the middleware
  // matcher (or middleware is absent entirely in local/CI). Treating that
  // as anonymous keeps the route's 401 contract honest instead of 500ing.
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session.userId ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json(
      errorEnvelope("unauthorized", "UNAUTHORIZED"),
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Body is optional but we still route it through parseBody so the
  // lint:zod-routes guard sees a schema on the mutating handler.
  const parsed = await parseBody(request, LikePostSchema, { allowEmpty: true });
  if (!parsed.ok) {
    return parsed.response as NextResponse<LikeErrorResponse>;
  }

  const rate = await checkRateLimitAsync(request, {
    ...LIKE_RATE_LIMIT,
    subject: userId,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      errorEnvelope("rate limit exceeded — try again shortly", "RATE_LIMITED"),
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  try {
    const status = await toggleLike(`${owner}/${name}`, userId);
    return NextResponse.json(
      { ok: true, count: status.count, liked: status.liked },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError<LikeErrorResponse>(err, {
      scope: "[repos/:owner/:name/like:POST]",
    });
  }
}
