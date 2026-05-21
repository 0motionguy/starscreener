// POST /api/ideas/[id]/related-repos — append a SECONDARY repo to an
// idea. The primary slot is owned by /attach-repo; this endpoint never
// clobbers it. Refuses to grow the list past the per-idea cap (5).
//
// Auth: requireUser() (Clerk). Author or current claimer only.
//
// Body schema:
//   { fullName: string, note?: string }
//
// Note on `note`: the underlying store keeps `targetRepos` as a flat
// string[], so per-entry notes are accepted at the boundary but
// silently dropped on persistence. The schema preserves the field for
// forward-compat — once ideas migrate to a relational store with an
// idea_related_repos join table, the note will round-trip.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  addRelatedRepoToIdea,
  normalizeAttachableRepo,
  toPublicIdea,
  type PublicIdea,
} from "@/lib/ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELATED_REPOS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
} as const;

const RelatedRepoBodySchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  note: z.string().trim().max(240).optional(),
});

interface RelatedRepoSuccessResponse {
  ok: true;
  outcome: "appended";
  fullName: string;
  idea: PublicIdea;
}

interface RelatedRepoConflictResponse {
  ok: false;
  error: string;
  code:
    | "ALREADY_ATTACHED"
    | "ALREADY_RELATED"
    | "LIMIT_REACHED"
    | "NOT_MUTABLE"
    | "NOT_OWNER"
    | "RATE_LIMITED"
    | "INVALID_REPO";
  idea?: PublicIdea;
}

interface RelatedRepoErrorResponse {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<
  NextResponse<
    | RelatedRepoSuccessResponse
    | RelatedRepoConflictResponse
    | RelatedRepoErrorResponse
  >
> {
  const { id } = await context.params;
  if (!id || id.length === 0) {
    return NextResponse.json(errorEnvelope("id is required"), { status: 400 });
  }

  const user = await requireUser();

  const rate = await checkRateLimitAsync(request, {
    ...RELATED_REPOS_RATE_LIMIT,
    subject: user.profile.id,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate limit exceeded — try again shortly",
        code: "RATE_LIMITED",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  const parsed = await parseBody(request, RelatedRepoBodySchema);
  if (!parsed.ok) {
    return parsed.response as NextResponse<RelatedRepoErrorResponse>;
  }

  const fullName = normalizeAttachableRepo(parsed.data.fullName);
  if (!fullName) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid repo reference — expected owner/name or github.com URL",
        code: "INVALID_REPO",
      },
      { status: 422, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const outcome = await addRelatedRepoToIdea(id, user.clerkUserId, fullName);
    switch (outcome.kind) {
      case "appended":
        return NextResponse.json({
          ok: true,
          outcome: "appended",
          fullName,
          idea: toPublicIdea(outcome.record),
        });
      case "already-attached":
        return NextResponse.json(
          {
            ok: false,
            error: "repo is already attached as the primary",
            code: "ALREADY_ATTACHED",
            idea: toPublicIdea(outcome.record),
          },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      case "already-related":
        return NextResponse.json(
          {
            ok: false,
            error: "repo is already listed as a related repo",
            code: "ALREADY_RELATED",
            idea: toPublicIdea(outcome.record),
          },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      case "limit-reached":
        return NextResponse.json(
          {
            ok: false,
            error: "idea already has the maximum number of related repos",
            code: "LIMIT_REACHED",
            idea: toPublicIdea(outcome.record),
          },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      case "not-owner":
        return NextResponse.json(
          {
            ok: false,
            error: "only the author or claimer can add a related repo",
            code: "NOT_OWNER",
          },
          { status: 403, headers: { "Cache-Control": "private, no-store" } },
        );
      case "not-mutable":
        return NextResponse.json(
          {
            ok: false,
            error: outcome.reason,
            code: "NOT_MUTABLE",
          },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      case "not-found":
        return NextResponse.json(errorEnvelope("idea not found"), {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        });
      // `attached` is produced only by the primary-attach writer.
      case "attached":
        return serverError<RelatedRepoErrorResponse>(
          new Error(`unexpected outcome from addRelatedRepoToIdea: ${outcome.kind}`),
          { scope: "[ideas/:id/related-repos]" },
        );
    }
  } catch (err) {
    return serverError<RelatedRepoErrorResponse>(err, {
      scope: "[ideas/:id/related-repos]",
    });
  }
}
