// StarScreener — robots.txt
//
// Allow every crawler to index public routes, block private + internal
// surfaces (/api/internal, /admin, /you), and point at the canonical
// sitemap so search engines can discover repo + category pages.
//
// NOTE: /api/ is fully disallowed — public REST endpoints under /api/repos
// are reachable but we don't want crawlers spidering the API surface for
// content; they should follow sitemap-listed canonical pages instead.

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/api/*",
          "/api/internal/",
          "/api/internal/*",
          "/admin",
          "/admin/*",
          "/you",
          "/you/*",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
