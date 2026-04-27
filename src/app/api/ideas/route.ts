// GET  /api/ideas?sort=hot|new|shipped&limit=20&offset=0
//      Public list of ideas. Excludes pending_moderation and rejected
//      from anonymous reads. The Hot view weights builder reactions
//      (build/use/buy/invest) by their commitment level, then decays
//      by recency.
//
// POST /api/ideas
//      Authenticated. Creates a new idea. Author's first 5 ideas land
//      in pending_moderation; subsequent posts auto-publish. authorId
//      is always derived from the auth header — body fields ignored.

import { NextRequest, NextResponse } from "next/server";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { serverError } from "@/lib/api/error-response";
import {
  createIdea,
  hotScore,
  listIdeas,
  toPublicIdea,
  validateIdeaInput,
  type IdeaRecord,
  type PublicIdea,
} from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
  type ReactionCounts,
} from "@/lib/reactions";

interface IdeaWithCounts extends PublicIdea {
  reactionCounts: ReactionCounts;
  hotScore?: number;
}

export interface IdeasListResponse {
  ok: true;
  ideas: IdeaWithCounts[];
  sort: "hot" | "new" | "shipped";
  total: number;
}

export interface IdeasCreateResponse {
  ok: true;
  result:
    | { kind: "queued"; idea: PublicIdea }
    | { kind: "published"; idea: PublicIdea }
    | { kind: "duplicate"; idea: PublicIdea };
}

export interface IdeasErrorResponse {
  ok: false;
  error: string;
  details?: { field: string; message: string }[];
  code?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseSort(value: string | null): "hot" | "new" | "shipped" {
  if (value === "new" || value === "shipped") return value;
  return "hot";
}

function publiclyVisible(record: IdeaRecord): boolean {
  // pending_moderation and rejected stay private to the queue.
  return (
    record.status === "published" ||
    record.status === "shipped" ||
    record.status === "archived"
  );
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<IdeasListResponse | IdeasErrorResponse>> {
  const { searchParams } = request.nextUrl;
  const sort = parseSort(searchParams.get("sort"));
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const offsetRaw = Number.parseInt(searchParams.get("offset") ?? "", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  try {
    const all = await listIdeas();
    const visible = all.filter(publiclyVisible);

    // Pull reaction counts for the visible set in one batched read of the
    // file via individual lookups — listReactionsForObject reads the file
    // once per call. For >100 ideas this could be optimized to a single
    // pass over the reactions store; for v1 the cost is bounded.
    const withCounts: IdeaWithCounts[] = await Promise.all(
      visible.map(async (record) => {
        const reactions = await listReactionsForObject("idea", record.id);
        const counts = countReactions(reactions);
        return {
          ...toPublicIdea(record),
          reactionCounts: counts,
        };
      }),
    );

    const now = Date.now();
    let ranked: IdeaWithCounts[];
    if (sort === "shipped") {
      ranked = withCounts
        .filter(
          (i) => i.buildStatus === "shipped" || i.status === "shipped",
        )
        .sort(
          (a, b) =>
            Date.parse(b.publishedAt ?? b.createdAt) -
            Date.parse(a.publishedAt ?? a.createdAt),
        );
    } else if (sort === "new") {
      ranked = withCounts.sort(
        (a, b) =>
          Date.parse(b.publishedAt ?? b.createdAt) -
          Date.parse(a.publishedAt ?? a.createdAt),
      );
    } else {
      ranked = withCounts
        .map((i) => ({
          ...i,
          hotScore: hotScore(
            { createdAt: i.publishedAt ?? i.createdAt },
            i.reactionCounts,
            now,
          ),
        }))
        .sort((a, b) => (b.hotScore ?? 0) - (a.hotScore ?? 0));
    }

    return NextResponse.json({
      ok: true,
      sort,
      total: ranked.length,
      ideas: ranked.slice(offset, offset + limit),
    });
  } catch (err) {
    return serverError<IdeasErrorResponse>(err, { scope: "[ideas:GET]" });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IdeasCreateResponse | IdeasErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<IdeasErrorResponse>;
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

  const parsed = validateIdeaInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "validation failed", details: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const result = await createIdea({
      ...parsed.value,
      authorId: userId,
      // For v1, no display-name table — handle is the userId. Once a
      // users profile lookup is wired in, replace this with a fetch.
      authorHandle: userId,
    });
    if (result.kind === "duplicate") {
      return NextResponse.json(
        {
          ok: true,
          result: { kind: "duplicate", idea: toPublicIdea(result.existing) },
        },
        { status: 200 },
      );
    }
    const responseIdea = toPublicIdea(result.record);
    return NextResponse.json({
      ok: true,
      result:
        result.kind === "queued"
          ? { kind: "queued", idea: responseIdea }
          : { kind: "published", idea: responseIdea },
    });
  } catch (err) {
    return serverError<IdeasErrorResponse>(err, { scope: "[ideas:POST]" });
  }
}
