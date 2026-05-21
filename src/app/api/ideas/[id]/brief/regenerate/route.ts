// POST /api/ideas/[id]/brief/regenerate — LLM-regenerate the brief.
//
// Currently a HONEST 501: the main app has no shipped LLM client.
// `src/lib/llm/` is the analytics aggregator (LlmEvent / DailyMetric),
// not a callable completion client. The actual LLM call lives in the
// sister Railway service at apps/trendingrepo-worker, which is not
// imported here and is not reachable from a Next route at the moment.
//
// We still gate this endpoint on auth + ownership + rate-limit so the
// public auth contract doesn't change the day the LLM wrapper lands —
// flipping the implementation only swaps the 501 branch for a call into
// the wrapper + saveIdeaBrief.
//
// Body schema is forward-declared (`promptOverride?: string`) so the
// client UI can already round-trip the field; the route ignores it for
// now apart from validation.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getIdeaById } from "@/lib/ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tighter cap than /save — LLM calls are expensive (latency + tokens),
// and a runaway autoclicker shouldn't be able to fan out arbitrary calls.
// 10/min per user is well above any plausible "click regenerate, hate it,
// try again" cadence (one every 6s).
const BRIEF_REGEN_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

const BriefRegenerateSchema = z.object({
  promptOverride: z
    .string()
    .max(2000, "promptOverride must be <= 2000 characters")
    .optional(),
});

interface BriefRegenerateErrorResponse {
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
): Promise<NextResponse<BriefRegenerateErrorResponse>> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const user = await requireUser();

  const rate = await checkRateLimitAsync(request, {
    ...BRIEF_REGEN_RATE_LIMIT,
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

  // Validate body shape even though we ignore the payload — keeps the
  // contract stable for the day the LLM wrapper lands and the schema is
  // already enforced (lint:zod-on-mutating-routes).
  const shape = await parseBody(request, BriefRegenerateSchema, {
    allowEmpty: true,
  });
  if (!shape.ok) {
    return shape.response as NextResponse<BriefRegenerateErrorResponse>;
  }

  try {
    // Ownership pre-flight — same rule as /save. Doing it BEFORE the
    // 501 so unauthenticated probes and non-claimers can't enumerate
    // idea IDs via the response discriminator.
    const idea = await getIdeaById(id);
    if (!idea) {
      return NextResponse.json(
        { ok: false, error: "idea not found" },
        { status: 404 },
      );
    }
    const isClaimer = !!idea.claimedBy && idea.claimedBy === user.clerkUserId;
    const isAdmin = user.profile.role === "admin";
    if (!isClaimer && !isAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: idea.claimedBy
            ? "idea is claimed by another user"
            : "claim the idea before regenerating its brief",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    // HONEST 501 — no local LLM client. See file header. Once a wrapper
    // lands (likely an HTTP client into apps/trendingrepo-worker), this
    // branch fans out into:
    //   const generated = await regenerateBriefViaLlm({ idea, promptOverride });
    //   const outcome   = await saveIdeaBrief({ ideaId: id, userId: ..., ... });
    //   return NextResponse.json({ ok: true, idea: toPublicIdea(outcome.record) });
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI regeneration is not configured on this deployment — the LLM client wrapper is not wired into the main app yet",
        code: "llm_not_configured",
      },
      { status: 501, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError<BriefRegenerateErrorResponse>(err, {
      scope: "[ideas/:id/brief/regenerate]",
    });
  }
}
