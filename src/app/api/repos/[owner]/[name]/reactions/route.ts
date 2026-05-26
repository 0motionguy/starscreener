// GET  /api/repos/[owner]/[name]/reactions — public read of reaction state
//                                              for all kinds.
//                                              Returns { ok: true, unicorn: { count, active } }.
//                                              `active` is false for anonymous callers.
//                                              Cache-Control: public, s-maxage=10, swr=30.
//
// POST /api/repos/[owner]/[name]/reactions — Clerk-gated toggle. Body:
//                                              { kind: "unicorn" }.
//                                              Rate-limited 60/min per user.
//                                              Returns { ok: true, kind, count, active }
//                                              for the toggled kind.
//
// Storage lives in src/lib/repo-reactions.ts (append-only JSONL).
//
// Adding a new kind: extend the Zod enum below + the RepoReactionKind union
// in src/lib/repo-reactions.ts + the per-kind blocks in GET below + the
// mount in RepoHeroCard. Server module exports stay backwards-compatible.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  getReactionStatus,
  toggleReaction,
  type RepoReactionKind,
} from "@/lib/repo-reactions";

const ReactionKindSchema = z.enum(["unicorn"]);
const PostBodySchema = z.object({ kind: ReactionKindSchema });

const REACTIONS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 60,
} as const;

// Slug guard — Next won't decode anything weirder than the URL spec, but
// owner/name still need to match GitHub's allowed character set so we
// don't open a path-traversal vector when composing repoFullName.
const SLUG_RE = /^[A-Za-z0-9._-]+$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReactionSlot {
  count: number;
  active: boolean;
}

interface ReactionsGetResponse {
  ok: true;
  unicorn: ReactionSlot;
}

interface ReactionsPostResponse {
  ok: true;
  kind: RepoReactionKind;
  count: number;
  active: boolean;
}

interface ReactionsErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

interface RouteContext {
  params: Promise<{ owner: string; name: string }>;
}

const ALL_KINDS: readonly RepoReactionKind[] = ["unicorn"] as const;

function badSlugResponse(): NextResponse<ReactionsErrorResponse> {
  return NextResponse.json(
    errorEnvelope("owner / name must match /^[A-Za-z0-9._-]+$/", "BAD_SLUG"),
    { status: 400 },
  );
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<ReactionsGetResponse | ReactionsErrorResponse>> {
  const { owner, name } = await context.params;
  if (!SLUG_RE.test(owner) || !SLUG_RE.test(name)) {
    return badSlugResponse();
  }

  try {
    // Public GET — surface `active` against the caller's session when we
    // have one, else false. We swallow auth() errors so a missing Clerk
    // middleware in local/CI doesn't break anonymous reads.
    let clerkUserId: string | null = null;
    try {
      const session = await auth();
      clerkUserId = session.userId ?? null;
    } catch {
      clerkUserId = null;
    }

    const fullName = `${owner}/${name}`;
    const statuses = await Promise.all(
      ALL_KINDS.map(async (kind) => {
        const status = await getReactionStatus(fullName, kind, clerkUserId);
        return [kind, status] as const;
      }),
    );

    const body: ReactionsGetResponse = {
      ok: true,
      unicorn: statuses.find(([k]) => k === "unicorn")?.[1] ?? {
        count: 0,
        active: false,
      },
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    return serverError<ReactionsErrorResponse>(err, {
      scope: "[repos/:owner/:name/reactions:GET]",
    });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<ReactionsPostResponse | ReactionsErrorResponse>> {
  const { owner, name } = await context.params;
  if (!SLUG_RE.test(owner) || !SLUG_RE.test(name)) {
    return badSlugResponse();
  }

  // JSON 401 (not the Clerk HTML sign-in redirect) — this is a JSON API
  // surface and clients need the envelope shape they get on every other
  // 4xx from this codebase. requireUser() would redirect, which is wrong
  // for fetch() callers; auth() + manual 401 is the right primitive.
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

  const parsed = await parseBody(request, PostBodySchema);
  if (!parsed.ok) {
    return parsed.response as NextResponse<ReactionsErrorResponse>;
  }
  const { kind } = parsed.data;

  const rate = await checkRateLimitAsync(request, {
    ...REACTIONS_RATE_LIMIT,
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
    const status = await toggleReaction(`${owner}/${name}`, kind, userId);
    return NextResponse.json(
      { ok: true, kind, count: status.count, active: status.active },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError<ReactionsErrorResponse>(err, {
      scope: "[repos/:owner/:name/reactions:POST]",
    });
  }
}
