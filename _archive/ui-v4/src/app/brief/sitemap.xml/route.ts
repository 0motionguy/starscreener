import { listRepoBriefRefs } from "@/lib/briefs";
import { absoluteUrl } from "@/lib/seo";
import { renderUrlset, type UrlEntry, xmlResponse } from "@/lib/sitemap-xml";

export const revalidate = 3600;
export const dynamic = "force-static";

export function GET(): Response {
  const entries: UrlEntry[] = listRepoBriefRefs().map((brief) => {
    const writtenAt = brief.writtenAt ? new Date(brief.writtenAt) : null;
    const lastmod =
      writtenAt && !Number.isNaN(writtenAt.getTime())
        ? writtenAt
        : brief.updatedAt;

    return {
      loc: absoluteUrl(`/brief/${brief.owner}/${brief.name}`),
      lastmod,
      changefreq: "weekly",
      priority: 0.7,
    };
  });

  return xmlResponse(renderUrlset(entries), 3600);
}
