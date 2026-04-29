// TrendingRepo — digest sub-sitemap (/sitemap-digest.xml)
//
// Lists the digest hub (/digest) plus every per-date snapshot URL that
// `listAvailableDigestDates()` reports. While historical archive support
// is not yet shipping (see lib/digest/queries.ts header), the sitemap
// will automatically pick up dated entries the moment the data layer
// starts returning them — no further changes needed here.

import {
  renderUrlset,
  xmlResponse,
  type UrlEntry,
} from "@/lib/sitemap-xml";
import { listAvailableDigestDates } from "@/lib/digest/queries";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const dates = await listAvailableDigestDates();
  const now = new Date();

  const entries: UrlEntry[] = [
    {
      loc: absoluteUrl("/digest"),
      lastmod: now,
      changefreq: "daily",
      priority: 0.7,
    },
    ...dates.map<UrlEntry>((date) => ({
      loc: absoluteUrl(`/digest/${date}`),
      // Per-date pages never change once written, so lastmod is the date
      // itself — picks up the natural "last update was on that day" signal
      // crawlers use to skip re-fetch on stable historical pages.
      lastmod: `${date}T23:59:59Z`,
      changefreq: "monthly",
      priority: 0.6,
    })),
  ];

  return xmlResponse(renderUrlset(entries), 3600);
}
