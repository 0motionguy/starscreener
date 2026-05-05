import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-static";
// 1 hour (60 * 60)
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const body = [
    "policy_version: 1",
    "site: TrendingRepo",
    `homepage: ${SITE_URL}/`,
    "allow_ai_crawlers: true",
    "contact: hello@trendingrepo.com",
    `llms_txt: ${SITE_URL}/llms.txt`,
    `llms_full: ${SITE_URL}/llms-full.txt`,
    `ai_summary_json: ${SITE_URL}/ai/summary.json`,
    `sitemap: ${SITE_URL}/sitemap.xml`
  ].join("\n");

  return new Response(`${body}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600"
    }
  });
}
