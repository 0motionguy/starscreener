import { NextResponse } from "next/server";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-static";
// 1 hour (60 * 60)
export const revalidate = 3600;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      founded: "2026",
      contact: { email: "hello@trendingrepo.com" },
      services: [
        "Open-source trend intelligence across GitHub, Reddit, Hacker News, ProductHunt, Bluesky, and dev.to",
        "AI/LLM discovery endpoints and llms.txt index",
        "Repo-level momentum analysis and mentions tracking"
      ],
      brand_assets: { logo: `${SITE_URL}/brand/trendingrepo-mark.svg` },
      docs: {
        llms: `${SITE_URL}/llms.txt`,
        llms_full: `${SITE_URL}/llms-full.txt`,
        sitemap: `${SITE_URL}/sitemap.xml`
      }
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
