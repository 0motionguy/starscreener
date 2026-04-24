// TrendingRepo — /api/ideas/[slug]

import { NextRequest, NextResponse } from "next/server";
import { getBuilderStore } from "@/lib/builder/store";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const store = getBuilderStore();
  const idea = await store.getIdea(slug);
  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }
  const [tally, sprints] = await Promise.all([
    store.getTally("idea", idea.slug),
    store.sprintsByIdea(idea.id),
  ]);
  const author = await store.getBuilder(idea.authorBuilderId);

  return NextResponse.json(
    {
      idea,
      author: author
        ? {
            id: author.id,
            handle: author.handle,
            depthScore: author.depthScore,
            githubLogin: author.githubLogin ?? null,
          }
        : null,
      tally,
      sprints,
      _links: {
        self: `/ideas/${idea.slug}`,
        portal_tool: "idea",
        mcp_resource: `mcp://trendingrepo/idea/${idea.slug}`,
      },
    },
    { headers: READ_CACHE_HEADERS },
  );
}
