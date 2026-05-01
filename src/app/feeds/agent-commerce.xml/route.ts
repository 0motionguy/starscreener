// /feeds/agent-commerce.xml
//
// RSS 2.0 feed of the most-recent Agent Commerce entities by lastUpdatedAt.

import {
  getAgentCommerceItems,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import type { AgentCommerceItem } from "@/lib/agent-commerce/types";
import { renderRssFeed, type RssItem } from "@/lib/feeds/rss";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 1800;

const MAX_ITEMS = 30;

function itemTitle(item: AgentCommerceItem): string {
  const flags: string[] = [];
  if (item.badges.x402Enabled) flags.push("x402");
  if (item.badges.portalReady) flags.push("Portal");
  if (item.badges.mcpServer) flags.push("MCP");
  const tag = flags.length > 0 ? ` [${flags.join(" · ")}]` : "";
  return `${item.name}${tag}`;
}

function itemDescription(item: AgentCommerceItem): string {
  const parts: string[] = [];
  parts.push(`<p><strong>${item.kind} · ${item.category}</strong></p>`);
  parts.push(`<p>${item.brief}</p>`);
  if (item.capabilities.length > 0) {
    parts.push(`<p>Capabilities: ${item.capabilities.slice(0, 8).join(", ")}</p>`);
  }
  if (item.pricing.type !== "unknown") {
    const price = item.pricing.value
      ? `${item.pricing.type} (${item.pricing.value})`
      : item.pricing.type;
    parts.push(`<p>Pricing: ${price}</p>`);
  }
  parts.push(`<p>Composite: <strong>${item.scores.composite}</strong>/100</p>`);
  return parts.join("\n");
}

function byUpdatedDesc(a: AgentCommerceItem, b: AgentCommerceItem): number {
  const ta = Date.parse(a.lastUpdatedAt);
  const tb = Date.parse(b.lastUpdatedAt);
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
}

export async function GET(): Promise<Response> {
  await refreshAgentCommerceFromStore();
  const ordered = [...getAgentCommerceItems()]
    .sort(byUpdatedDesc)
    .slice(0, MAX_ITEMS);

  const items: RssItem[] = ordered.map((item) => {
    const link = absoluteUrl(`/agent-commerce/${item.slug}`);
    return {
      title: itemTitle(item),
      link,
      guid: item.id,
      pubDate: item.lastUpdatedAt,
      description: itemDescription(item),
      author: item.kind,
      categories: item.tags,
    };
  });

  const xml = renderRssFeed({
    title: `${SITE_NAME} — Agent Commerce`,
    link: absoluteUrl("/feeds/agent-commerce.xml"),
    description:
      "Agent-callable services: x402, MCP, agent wallets, APIs, marketplaces. The M2M economy index.",
    lastBuildDate: new Date().toISOString(),
    items,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
