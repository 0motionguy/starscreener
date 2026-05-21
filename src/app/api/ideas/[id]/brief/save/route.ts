// POST /api/ideas/[id]/brief/save — persist an edited brief markdown.
//
// Ownership rule: the caller must either (a) be the claimer of the idea
// (`ideas.claimedBy === clerkUserId`) or (b) hold profile.role === 'admin'.
// Author-without-claim is intentionally NOT permitted — Phase 4C made the
// claimer the build-work owner, and the brief is build-work content.
//
// Optimistic concurrency: the client should round-trip the `briefVersion`
// it last read; the writer rejects with 409 + RECONCILE if the stored
// version is strictly greater. Omitting the field opts out (first save or
// "force overwrite" flows).
//
// Idempotency: re-saving identical markdown still bumps the version. This
// is intentional — `briefSavedAt` should reflect the most recent author
// intent, even on a no-op re-save.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  MAX_BRIEF_MARKDOWN,
  saveIdeaBrief,
  toPublicIdea,
  type PublicIdea,
} from "@/lib/ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-user rate-limit on brief save. Each save rewrites ideas.jsonl under
// a global lock; without a cap, an authed claimer (or compromised session)
// can saturate the lock with a key-mash autosave. 30/min is well above any
// human edit cadence (one save every 2s) while keeping a flooder out.
// Mirrors the /api/ideas/[id]/contributions POST limit.
const BRIEF_SAVE_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const BriefSaveSchema = z.object({
  // .min(1) — empty brief is "delete the brief", which we don't expose
  // as a single endpoint. The UI shows the static template as fallback
  // when briefMarkdown is undefined; deletion is admin-only via JSONL
  // surgery for now.
  briefMarkdown: z
    .string()
    .min(1, "briefMarkdown must not be empty")
    .max(
      MAX_BRIEF_MARKDOWN,
      `briefMarkdown must be <= ${MAX_BRIEF_MARKDOWN} characters`,
    ),
  // Optimistic-concurrency token. Optional — first save has no prior
  // version; an explicit `null` is treated as omitted.
  version: z.number().int().nonnegative().optional(),
});

interface BriefSaveSuccessResponse {
  ok: true;
  idea: PublicIdea;
  /** Convenience echo so the client can update its local optimistic state. */
  briefVersion: number;
}

interface BriefSaveErrorResponse {
  ok: false;
  error: string;
  code?: string;
  /** On RECONCILE conflicts, the server's current version is echoed. */
  currentVersion?: number;
  details?: unknown;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<BriefSaveSuccessResponse | BriefSaveErrorResponse>> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const user = await requireUser();

  const rate = await checkRateLimitAsync(request, {
    ...BRIEF_SAVE_RATE_LIMIT,
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

  const shape = await parseBody(request, BriefSaveSchema);
  if (!shape.ok) {
    return shape.response as NextResponse<BriefSaveErrorResponse>;
  }

  try {
    const outcome = await saveIdeaBrief({
      ideaId: id,
      userId: user.clerkUserId,
      isAdmin: user.profile.role === "admin",
      briefMarkdown: shape.data.briefMarkdown,
      expectedVersion: shape.data.version,
    });

    switch (outcome.kind) {
      case "saved":
        return NextResponse.json({
          ok: true,
          idea: toPublicIdea(outcome.record),
          briefVersion: outcome.record.briefVersion ?? 1,
        });
      case "not-found":
        return NextResponse.json(
          { ok: false, error: "idea not found" },
          { status: 404 },
        );
      case "forbidden":
        return NextResponse.json(
          {
            ok: false,
            error: outcome.reason,
            code: "FORBIDDEN",
          },
          { status: 403 },
        );
      case "stale":
        return NextResponse.json(
          {
            ok: false,
            error: "brief was updated by another session — refresh and retry",
            code: "RECONCILE",
            currentVersion: outcome.currentVersion,
          },
          { status: 409 },
        );
    }
  } catch (err) {
    return serverError<BriefSaveErrorResponse>(err, {
      scope: "[ideas/:id/brief/save]",
    });
  }
}
