// Agent Commerce — derived stats + URL-param parsing.
//
// Mirrors src/lib/funding/extract.ts:buildFundingStats. Page header
// reads the result; the heavy lifting (composite scoring) already
// happened at write time.

import type {
  AgentCommerceCategory,
  AgentCommerceItem,
  AgentCommerceKind,
  AgentCommerceProtocol,
  AgentCommerceStats,
} from "./types";

export const KINDS: AgentCommerceKind[] = [
  "api",
  "marketplace",
  "wallet",
  "protocol",
  "tool",
  "infra",
];

export const CATEGORIES: AgentCommerceCategory[] = [
  "payments",
  "data",
  "infra",
  "marketplace",
  "auth",
  "inference",
];

export const PROTOCOLS: AgentCommerceProtocol[] = [
  "x402",
  "http",
  "mcp",
  "a2a",
  "rest",
  "graphql",
  "grpc",
];

export const TABS = [
  "overview",
  "payments",
  "marketplaces",
  "apis",
  "wallets",
  "mcp",
  "signals",
  "opportunities",
] as const;
export type AgentCommerceTab = (typeof TABS)[number];

export const PRICING_TYPES = ["per_call", "subscription", "free"] as const;
export type AgentCommercePricingFilter = (typeof PRICING_TYPES)[number];

const HIGH_AISO_THRESHOLD = 80;

export function buildAgentCommerceStats(
  items: AgentCommerceItem[],
): AgentCommerceStats {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const byKind = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<
    AgentCommerceKind,
    number
  >;
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, 0]),
  ) as Record<AgentCommerceCategory, number>;
  const byProtocol: Record<string, number> = {};

  let portalReadyCount = 0;
  let x402EnabledCount = 0;
  let mcpServerCount = 0;
  let agentActionableCount = 0;
  let highAisoCount = 0;
  let thisWeekCount = 0;
  let topComposite = 0;
  let sumComposite = 0;

  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    for (const p of item.protocols) {
      byProtocol[p] = (byProtocol[p] ?? 0) + 1;
    }
    if (item.badges.portalReady) portalReadyCount++;
    if (item.badges.x402Enabled) x402EnabledCount++;
    if (item.badges.mcpServer) mcpServerCount++;
    if (item.badges.agentActionable) agentActionableCount++;
    if ((item.scores.aisoScore ?? 0) >= HIGH_AISO_THRESHOLD) highAisoCount++;

    const seenAt = Date.parse(item.firstSeenAt);
    if (Number.isFinite(seenAt) && seenAt >= weekAgo) thisWeekCount++;

    sumComposite += item.scores.composite;
    if (item.scores.composite > topComposite) {
      topComposite = item.scores.composite;
    }
  }

  const averageComposite =
    items.length > 0 ? Math.round(sumComposite / items.length) : 0;

  return {
    totalItems: items.length,
    byKind,
    byCategory,
    byProtocol,
    portalReadyCount,
    x402EnabledCount,
    mcpServerCount,
    agentActionableCount,
    highAisoCount,
    thisWeekCount,
    topComposite,
    averageComposite,
  };
}

// ---------------------------------------------------------------------------
// URL state parsing — same shape as src/app/signals/page.tsx helpers.
// ---------------------------------------------------------------------------

export function parseTab(raw: unknown): AgentCommerceTab {
  if (typeof raw !== "string") return "overview";
  return (TABS as readonly string[]).includes(raw)
    ? (raw as AgentCommerceTab)
    : "overview";
}

export function parseCategory(raw: unknown): AgentCommerceCategory | null {
  if (typeof raw !== "string") return null;
  return CATEGORIES.includes(raw as AgentCommerceCategory)
    ? (raw as AgentCommerceCategory)
    : null;
}

export function parseProtocols(raw: unknown): Set<AgentCommerceProtocol> {
  const out = new Set<AgentCommerceProtocol>();
  if (typeof raw !== "string") return out;
  for (const part of raw.split(",")) {
    const trimmed = part.trim() as AgentCommerceProtocol;
    if (PROTOCOLS.includes(trimmed)) out.add(trimmed);
  }
  return out;
}

export function parsePricing(raw: unknown): AgentCommercePricingFilter | null {
  if (typeof raw !== "string") return null;
  return PRICING_TYPES.includes(raw as AgentCommercePricingFilter)
    ? (raw as AgentCommercePricingFilter)
    : null;
}

export function parsePortalReady(raw: unknown): boolean {
  return raw === "1" || raw === "true";
}

export function parseSearchQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().slice(0, 120);
}

// ---------------------------------------------------------------------------
// Filtering (used by page + API routes)
// ---------------------------------------------------------------------------

export interface AgentCommerceFilter {
  tab: AgentCommerceTab;
  category: AgentCommerceCategory | null;
  protocols: Set<AgentCommerceProtocol>;
  pricing: AgentCommercePricingFilter | null;
  portalReady: boolean;
  query: string;
}

const TAB_TO_KIND: Partial<Record<AgentCommerceTab, AgentCommerceKind[]>> = {
  payments: ["protocol", "infra"],
  marketplaces: ["marketplace"],
  apis: ["api"],
  wallets: ["wallet"],
  mcp: ["tool"],
};

const TAB_TO_CATEGORY: Partial<
  Record<AgentCommerceTab, AgentCommerceCategory[]>
> = {
  payments: ["payments"],
  marketplaces: ["marketplace"],
  apis: ["data", "inference"],
  wallets: ["auth"],
  mcp: ["infra"],
};

export function applyFilter(
  items: AgentCommerceItem[],
  filter: AgentCommerceFilter,
): AgentCommerceItem[] {
  return items.filter((item) => {
    if (filter.tab !== "overview" && filter.tab !== "signals" && filter.tab !== "opportunities") {
      const kinds = TAB_TO_KIND[filter.tab];
      const cats = TAB_TO_CATEGORY[filter.tab];
      const matchKind = kinds ? kinds.includes(item.kind) : true;
      const matchCat = cats ? cats.includes(item.category) : true;
      if (filter.tab === "payments") {
        if (!item.protocols.includes("x402") && !item.protocols.includes("a2a")) {
          if (!matchKind && !matchCat) return false;
        }
      } else if (filter.tab === "mcp") {
        if (!item.badges.mcpServer && !matchKind) return false;
      } else if (!matchKind && !matchCat) {
        return false;
      }
    }

    if (filter.category && item.category !== filter.category) return false;

    if (filter.protocols.size > 0) {
      const hasProto = item.protocols.some((p) => filter.protocols.has(p));
      if (!hasProto) return false;
    }

    if (filter.pricing && item.pricing.type !== filter.pricing) return false;

    if (filter.portalReady && !item.badges.portalReady) return false;

    if (filter.query) {
      const haystack = [
        item.name,
        item.brief,
        item.capabilities.join(" "),
        item.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(filter.query)) return false;
    }

    return true;
  });
}
