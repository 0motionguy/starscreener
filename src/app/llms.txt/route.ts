// TrendingRepo — /llms.txt (short index for LLM crawlers)
//
// Short, crawler-friendly markdown index. Keep this focused on canonical
// surfaces and machine endpoints; detailed corpus stays in /llms-full.txt.

import { listRecentBriefs } from "@/lib/briefs";
import { absoluteUrl, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 86400;

interface LinkItem {
  label: string;
  path: string;
  note: string;
}

const PRIMARY_SURFACES: LinkItem[] = [
  { label: "Trending Repos", path: "/", note: "Main leaderboard and momentum snapshots" },
  { label: "Cross-Signal Breakouts", path: "/breakouts", note: "Repos breaking out across multiple channels" },
  { label: "Signals", path: "/signals", note: "Unified channel view (HN/Reddit/Bluesky/dev.to/Lobsters)" },
  { label: "Funding Radar", path: "/funding", note: "OSS funding and launch signals" },
  { label: "Categories", path: "/categories", note: "Curated category drilldowns" },
  { label: "Collections", path: "/collections", note: "OSS Insight collection rankings" },
];

const SOURCE_FEEDS: LinkItem[] = [
  { label: "Hacker News", path: "/hackernews/trending", note: "HN-linked repo trends" },
  { label: "Reddit", path: "/reddit/trending", note: "Subreddit mention trends" },
  { label: "Bluesky", path: "/bluesky/trending", note: "ATProto social trend signals" },
  { label: "dev.to", path: "/devto", note: "Developer post trends" },
  { label: "ProductHunt", path: "/producthunt", note: "Launch-day repo signals" },
  { label: "Lobsters", path: "/lobsters", note: "Lobsters-linked technical trends" },
  { label: "Twitter/X", path: "/twitter", note: "X-derived repo trend panel" },
];

const PROGRAMMATIC_ENDPOINTS: LinkItem[] = [
  { label: "REST API", path: "/api/repos", note: "Repository list/filter/sort/pagination API" },
  { label: "OpenAPI JSON", path: "/api/openapi.json", note: "Machine-readable API contract" },
  { label: "Sitemap Index", path: "/sitemap.xml", note: "Canonical crawl graph root" },
  { label: "LLM Full Context", path: "/llms-full.txt", note: "Long-form markdown ingestion document" },
  { label: "AI Discovery Manifest", path: "/.well-known/ai-discovery", note: "Well-known AI discovery JSON" },
];

function renderLinks(title: string, links: LinkItem[]): string {
  const lines = [`## ${title}`, ""];
  for (const item of links) {
    lines.push(`- [${item.label}](${absoluteUrl(item.path)}) - ${item.note}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function renderRecentBriefs(): Promise<string> {
  let refs = [] as Awaited<ReturnType<typeof listRecentBriefs>>;
  try {
    refs = await listRecentBriefs(7);
  } catch {
    refs = [];
  }

  const lines = ["## Recent Briefs", ""];
  if (refs.length === 0) {
    lines.push("- No brief snapshots currently published.");
    lines.push("");
    return lines.join("\n");
  }

  for (const brief of refs) {
    lines.push(
      `- [${brief.owner}/${brief.name}](${absoluteUrl(`/brief/${brief.owner}/${brief.name}`)}) - written ${brief.writtenAt}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function GET(): Promise<Response> {
  const base = absoluteUrl("/");
  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}

## Canonical

- Website: ${base}
- llms.txt: ${absoluteUrl("/llms.txt")}
- llms-full.txt: ${absoluteUrl("/llms-full.txt")}
- ai-discovery: ${absoluteUrl("/.well-known/ai-discovery")}

${renderLinks("Primary Surfaces", PRIMARY_SURFACES)}
${renderLinks("Per-Source Feeds", SOURCE_FEEDS)}
${renderLinks("Programmatic Endpoints", PROGRAMMATIC_ENDPOINTS)}
${await renderRecentBriefs()}## Notes

- Content is designed for AI crawler discovery and citation routing.
- Use linked pages as canonical sources, not this summary text.
`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}

