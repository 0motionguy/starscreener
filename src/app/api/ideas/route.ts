// TrendingRepo — /api/ideas (list + create).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBuilderStore } from "@/lib/builder/store";
import { ensureBuilder } from "@/lib/builder/identity";
import { ideaIdFromSlug, slugify, shortId } from "@/lib/builder/ids";
import type {
  Idea,
  IdeaFeedCard,
  IdeaFeedQuery,
  IdeaPhase,
} from "@/lib/builder/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { checkRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORT_VALUES = ["hot", "new", "resolving"] as const;
const PHASE_VALUES: readonly IdeaPhase[] = [
  "seed",
  "alpha",
  "beta",
  "live",
  "sunset",
];

// ---------------------------------------------------------------------------
// GET /api/ideas — list feed
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sortRaw = sp.get("sort") ?? "new";
  const sort = SORT_VALUES.includes(sortRaw as (typeof SORT_VALUES)[number])
    ? (sortRaw as IdeaFeedQuery["sort"])
    : "new";
  const limit = clamp(parseInt(sp.get("limit") ?? "20", 10) || 20, 1, 50);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
  const tag = sp.get("tag")?.trim() || undefined;
  const phaseRaw = sp.get("phase") as IdeaPhase | null;
  const phase =
    phaseRaw && PHASE_VALUES.includes(phaseRaw) ? phaseRaw : undefined;

  const store = getBuilderStore();
  const ideas = await store.listIdeas({ sort, limit, offset, tag, phase });

  return NextResponse.json(
    { ideas, count: ideas.length, sort, limit, offset },
    { headers: READ_CACHE_HEADERS },
  );
}

// ---------------------------------------------------------------------------
// POST /api/ideas — create
// ---------------------------------------------------------------------------

const StackSchema = z.object({
  models: z.array(z.string().max(40)).max(8).default([]),
  apis: z.array(z.string().max(40)).max(16).default([]),
  tools: z.array(z.string().max(40)).max(16).default([]),
  skills: z.array(z.string().max(40)).max(16).default([]),
});

const CreateIdeaSchema = z.object({
  thesis: z.string().min(140).max(500),
  problem: z.string().min(140).max(500),
  whyNow: z.string().min(140).max(400),
  linkedRepoIds: z.array(z.string().min(1)).min(1).max(8),
  stack: StackSchema.default({ models: [], apis: [], tools: [], skills: [] }),
  tags: z.array(z.string().min(1).max(30)).max(12).default([]),
  public: z.boolean().default(true),
  agentReadiness: z
    .array(
      z.object({
        toolName: z.string().min(1).max(40),
        inputSketch: z.string().min(1).max(200),
        outputShape: z.string().min(1).max(200),
      }),
    )
    .max(6)
    .optional(),
});

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, { windowMs: 60_000, maxRequests: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Pace yourself." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid idea payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const builder = await ensureBuilder();
  const store = getBuilderStore();

  // Derive a unique slug by appending a short random suffix if the natural
  // slug already exists. Two tries is plenty given 10-char entropy.
  const baseSlug = slugify(parsed.data.thesis);
  let slug = baseSlug;
  let taken = await store.getIdea(slug);
  if (taken) {
    slug = `${baseSlug}-${shortId("x").slice(2, 6)}`;
    taken = await store.getIdea(slug);
    if (taken) {
      return NextResponse.json(
        { error: "Slug collision — refresh and try again." },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const idea: Idea = {
    id: ideaIdFromSlug(slug),
    slug,
    authorBuilderId: builder.id,
    thesis: parsed.data.thesis.trim(),
    problem: parsed.data.problem.trim(),
    whyNow: parsed.data.whyNow.trim(),
    linkedRepoIds: parsed.data.linkedRepoIds,
    stack: parsed.data.stack,
    tags: parsed.data.tags,
    phase: "seed",
    public: parsed.data.public,
    agentReadiness: parsed.data.agentReadiness,
    createdAt: now,
    updatedAt: now,
  };

  await store.createIdea(idea);

  return NextResponse.json(
    {
      idea: {
        id: idea.id,
        slug: idea.slug,
        thesis: idea.thesis,
        phase: idea.phase,
        public: idea.public,
        createdAt: idea.createdAt,
      },
      _links: {
        self: `/ideas/${slug}`,
        portal_tool: "idea",
        mcp_resource: `mcp://trendingrepo/idea/${slug}`,
      },
    },
    { status: 201 },
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
