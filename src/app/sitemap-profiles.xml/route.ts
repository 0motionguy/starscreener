import { absoluteUrl } from "@/lib/seo";
import {
  renderUrlset,
  type UrlEntry,
  xmlResponse,
} from "@/lib/sitemap-xml";
import { listProfileSitemapEntries } from "@/lib/sitemap-profiles";

export const revalidate = 600;
export const dynamic = "force-static";

const MAX_PROFILE_URLS = 5000;

export async function GET(): Promise<Response> {
  const profiles = await listProfileSitemapEntries(MAX_PROFILE_URLS);
  const entries: UrlEntry[] = profiles.map((profile) => ({
    loc: absoluteUrl(`/u/${profile.handle}`),
    lastmod: profile.lastmod,
    changefreq: "daily",
    priority: 0.6,
  }));

  return xmlResponse(renderUrlset(entries), 600);
}
