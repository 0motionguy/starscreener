// GET /api/ideas/[id] — fetch a single idea by short id.
// Returns 404 for ids that don't exist or that are still pending
// moderation / rejected (so the URL can't be used to leak draft text).

import { NextRequest, NextResponse } from "next/server";

import { serverError } from "@/lib/api/error-response";
import { getIdeaById, toPublicIdea } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
  type ReactionCounts,
} from "@/lib/reactions";

export const runtime = "nodejs";

interface IdeaDetailResponse {
  ok: true;
  idea: ReturnType<typeof toPublicIdea>;
  reactionCounts: ReactionCounts;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse<IdeaDetailResponse | ErrorResponse>> {
  const { id } = await context.params;
  if (!id || id.length === 0) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  try {
    const record = await getIdeaById(id);
    if (
      !record ||
      record.status === "pending_moderation" ||
      record.status === "rejected"
    ) {
      return NextResponse.json(
        { ok: false, error: "idea not found" },
        { status: 404 },
      );
    }
    const reactions = await listReactionsForObject("idea", record.id);
    return NextResponse.json({
      ok: true,
      idea: toPublicIdea(record),
      reactionCounts: countReactions(reactions),
    });
  } catch (err) {
    return serverError(err, { scope: "[ideas/:id]" });
  }
}
