// GET /api/tier-lists/templates/[slug] — resolve a template's repo list to
// editor pool items (with avatar metadata) so the client doesn't need to
// chase /api/search per repo.

import { NextResponse } from "next/server";

import { READ_SLOW_HEADERS } from "@/lib/api/cache";
import { errorEnvelope } from "@/lib/api/error-response";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { getTemplate } from "@/lib/tier-list/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const template = getTemplate(slug);
  if (!template) {
    return NextResponse.json(
      errorEnvelope("template not found", "NOT_FOUND"),
      { status: 404 },
    );
  }

  const items = template.repos.map((repoId) => {
    const repo = getDerivedRepoByFullName(repoId);
    if (!repo) {
      const [owner = "", name = ""] = repoId.split("/");
      return { repoId, owner, displayName: name || repoId };
    }
    return {
      repoId: repo.fullName,
      owner: repo.owner,
      displayName: repo.name,
      avatarUrl: repo.ownerAvatarUrl,
      stars: repo.stars,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      template: {
        slug: template.slug,
        name: template.name,
        description: template.description,
      },
      items,
    },
    { headers: READ_SLOW_HEADERS },
  );
}
