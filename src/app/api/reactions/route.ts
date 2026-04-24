// TrendingRepo — /api/reactions (add + list tally).
//
// POST: idempotent upsert keyed by (builder, kind, subject). Re-posting the
// same kind replaces the payload — this is how "I changed my mind on what
// I'd build" works without duplicates.
// GET:  return tally + recent reactions for a given subject.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBuilderStore } from "@/lib/builder/store";
import { ensureBuilder } from "@/lib/builder/identity";
import { shortId } from "@/lib/builder/ids";
import type { Reaction, ReactionKind } from "@/lib/builder/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { checkRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_VALUES: readonly ReactionKind[] = ["use", "build", "buy", "invest"];
const SUBJECT_TYPES = ["repo", "idea"] as const;

// ---------------------------------------------------------------------------
// GET /api/reactions?subjectType=repo&subjectId=vercel/next.js
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const subjectType = sp.get("subjectType");
  const subjectId = sp.get("subjectId");

  if (
    !subjectType ||
    !subjectId ||
    !SUBJECT_TYPES.includes(subjectType as (typeof SUBJECT_TYPES)[number])
  ) {
    return NextResponse.json(
      { error: "subjectType ('repo'|'idea') and subjectId are required" },
      { status: 400 },
    );
  }

  const store = getBuilderStore();
  const tally = await store.getTally(
    subjectType as "repo" | "idea",
    subjectId,
  );
  return NextResponse.json(
    { tally },
    { headers: READ_CACHE_HEADERS },
  );
}

// ---------------------------------------------------------------------------
// POST /api/reactions
// ---------------------------------------------------------------------------

const CreateReactionSchema = z.object({
  kind: z.enum(["use", "build", "buy", "invest"]),
  subjectType: z.enum(["repo", "idea"]),
  subjectId: z.string().min(1).max(200),
  payload: z
    .object({
      useCase: z.string().max(80).optional(),
      buildThesis: z.string().max(140).optional(),
      priceUsd: z.number().int().min(0).max(1_000_000).optional(),
      amountUsd: z.number().int().min(0).max(100_000_000).optional(),
      horizonYears: z.number().int().min(0).max(20).optional(),
    })
    .default({}),
  publicInvest: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, { windowMs: 60_000, maxRequests: 30 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateReactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reaction payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // If subject is an idea, make sure it exists.
  const store = getBuilderStore();
  if (parsed.data.subjectType === "idea") {
    const idea = await store.getIdea(parsed.data.subjectId);
    if (!idea || !idea.public) {
      return NextResponse.json(
        { error: "Idea not found or not public" },
        { status: 404 },
      );
    }
  }

  const builder = await ensureBuilder();

  // Idempotency: replace any prior same-kind reaction from this builder on
  // this subject. We achieve this by listing + removing, then inserting.
  // The Supabase implementation has a uniqueness constraint that makes this
  // a single upsert; the JSON implementation relies on this manual path.
  const existing = await store.getReactions(
    parsed.data.subjectType,
    parsed.data.subjectId,
  );
  const prior = existing.find(
    (r) => r.builderId === builder.id && r.kind === parsed.data.kind,
  );
  if (prior) {
    await store.removeReaction(prior.id, builder.id);
  }

  const reaction: Reaction = {
    id: shortId("rxn"),
    kind: parsed.data.kind,
    subjectType: parsed.data.subjectType,
    subjectId: parsed.data.subjectId,
    builderId: builder.id,
    payload: parsed.data.payload,
    publicInvest: parsed.data.publicInvest,
    createdAt: new Date().toISOString(),
  };

  await store.addReaction(reaction);
  const tally = await store.getTally(
    parsed.data.subjectType,
    parsed.data.subjectId,
  );

  return NextResponse.json(
    {
      reaction: {
        id: reaction.id,
        kind: reaction.kind,
        subjectType: reaction.subjectType,
        subjectId: reaction.subjectId,
        createdAt: reaction.createdAt,
      },
      tally,
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// DELETE /api/reactions?id=rxn_xxx — un-react
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const builder = await ensureBuilder();
  const store = getBuilderStore();
  const removed = await store.removeReaction(id, builder.id);
  if (!removed) {
    return NextResponse.json(
      { error: "Reaction not found or not yours" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
