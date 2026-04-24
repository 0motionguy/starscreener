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

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import {
  countReactions,
  emptyReactionCounts,
  isReactionObjectType,
  isReactionType,
  listReactionsForObject,
  toggleReaction,
  userReactionsFor,
  type ReactionCounts,
  type UserReactionState,
} from "@/lib/reactions";

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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const body = raw as Record<string, unknown>;
  const objectType = body.objectType;
  const objectId = body.objectId;
  const reactionType = body.reactionType;

  if (!isReactionObjectType(objectType)) {
    return NextResponse.json(
      { ok: false, error: "objectType must be 'repo' or 'idea'" },
      { status: 400 },
    );
  }
  if (typeof objectId !== "string" || !objectId.trim()) {
    return NextResponse.json(
      { ok: false, error: "objectId must be a non-empty string" },
      { status: 400 },
    );
  }
  if (!isReactionType(reactionType)) {
    return NextResponse.json(
      {
        ok: false,
        error: "reactionType must be one of: build, use, buy, invest",
      },
      { status: 400 },
    );
  }
  // userId is INTENTIONALLY not read from the body — it is derived from the
  // authenticated caller.

  try {
    const result = await toggleReaction({
      userId,
      objectType,
      objectId: objectId.trim(),
      reactionType,
    });

    // Re-derive counts + mine from the post-toggle state so the response is
    // a complete snapshot. Saves the client one round-trip.
    const records = await listReactionsForObject(
      objectType,
      objectId.trim(),
    );
    return NextResponse.json({
      ok: true,
      toggled: result.kind === "added" ? "added" : "removed",
      reactionType,
      counts: countReactions(records),
      mine: userReactionsFor(userId, records),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, counts: emptyReactionCounts() },
      { status: 500 },
    );
  }
}
