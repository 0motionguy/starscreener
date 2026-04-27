// GET  /api/reactions?objectType=repo&objectId=<id> — public counts +
//      (when authenticated) the caller's per-type state. Anonymous callers
//      get counts only.
//
// POST /api/reactions  — { objectType, objectId, reactionType } toggle.
//      Requires verifyUserAuth. Idempotent in the sense that two POSTs from
//      the same user toggle the row off-then-on (or on-then-off) — never
//      double-count.
//
// userId is ALWAYS derived from the auth header; any userId in the body is
// silently ignored (mirrors the alerts/rules contract).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import {
  countReactions,
  emptyReactionCounts,
  isReactionObjectType,
  listReactionsForObject,
  REACTION_OBJECT_TYPES,
  REACTION_TYPES,
  toggleReaction,
  userReactionsFor,
  type ReactionCounts,
  type UserReactionState,
} from "@/lib/reactions";

const ReactionsPostSchema = z.object({
  objectType: z.enum(REACTION_OBJECT_TYPES),
  objectId: z.string().trim().min(1, "objectId must be a non-empty string"),
  reactionType: z.enum(REACTION_TYPES),
});

export const runtime = "nodejs";

export interface ReactionsGetResponse {
  ok: true;
  objectType: string;
  objectId: string;
  counts: ReactionCounts;
  // Present only when the request carried valid user auth. Anonymous
  // callers get `null` so the UI can disable the buttons until login.
  mine: UserReactionState | null;
}

export interface ReactionsPostResponse {
  ok: true;
  toggled: "added" | "removed";
  reactionType: string;
  counts: ReactionCounts;
  mine: UserReactionState;
}

export interface ReactionsErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ReactionsGetResponse | ReactionsErrorResponse>> {
  const { searchParams } = request.nextUrl;
  const objectType = searchParams.get("objectType") ?? "repo";
  const objectId = (searchParams.get("objectId") ?? "").trim();

  if (!isReactionObjectType(objectType)) {
    return NextResponse.json(
      { ok: false, error: `objectType '${objectType}' is not supported` },
      { status: 400 },
    );
  }
  if (!objectId) {
    return NextResponse.json(
      { ok: false, error: "objectId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const records = await listReactionsForObject(objectType, objectId);
    const counts = countReactions(records);

    // Identify the caller, but a missing/invalid token is NOT an error here —
    // counts are public. Only the `mine` field is gated on auth.
    const auth = verifyUserAuth(request);
    const mine =
      auth.kind === "ok" ? userReactionsFor(auth.userId, records) : null;

    return NextResponse.json({
      ok: true,
      objectType,
      objectId,
      counts,
      mine,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ReactionsPostResponse | ReactionsErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<ReactionsErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { userId } = auth;

  const parsed = await parseBody(request, ReactionsPostSchema);
  if (!parsed.ok) return parsed.response as NextResponse<ReactionsErrorResponse>;
  const { objectType, objectId, reactionType } = parsed.data;
  // userId is INTENTIONALLY not read from the body — it is derived from the
  // authenticated caller.

  try {
    const result = await toggleReaction({
      userId,
      objectType,
      objectId,
      reactionType,
    });

    // Re-derive counts + mine from the post-toggle state so the response is
    // a complete snapshot. Saves the client one round-trip.
    const records = await listReactionsForObject(objectType, objectId);
    return NextResponse.json({
      ok: true,
      toggled: result.kind === "added" ? "added" : "removed",
      reactionType,
      counts: countReactions(records),
      mine: userReactionsFor(userId, records),
    });
  } catch (err) {
    // Server-side log includes raw err; response carries empty counts so the
    // client UI can keep rendering buttons without crashing on a missing key.
    console.error("[reactions:POST] toggle failed", { err });
    return NextResponse.json(
      { ok: false, error: "server error", counts: emptyReactionCounts() },
      { status: 500 },
    );
  }
}
