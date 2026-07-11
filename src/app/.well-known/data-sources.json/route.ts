import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(
    {
      version: "1.0",
      freshness_model: "HOSTUP worker-owned Redis/data-store snapshots with route-level ISR where configured.",
      sources: [
        "GitHub stars, forks, releases, contributors",
        "OSS Insight trending and collections",
        "Hacker News",
        "Reddit",
        "Bluesky",
        "dev.to",
        "Lobsters",
        "Product Hunt",
        "npm",
        "Hugging Face",
        "arXiv",
        "Toolbox signal adapters where enabled",
      ],
      public_status: ["/api/worker/health", "https://api.aiso.tools/status/trendingrepo"],
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
