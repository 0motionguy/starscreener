// Agent Commerce — entity types for the M2M-economy radar.
//
// Single canonical entity (`AgentCommerceItem`) covers APIs, marketplaces,
// wallets, protocols, MCP servers, agent infra. Tabs are filters over
// this corpus, not disjoint shapes.
//
// Score discipline: composite is computed at write time by the collector
// (apps/trendingrepo-worker/src/fetchers/agent-commerce/), not at render time.

export type AgentCommerceKind =
  | "api"
  | "marketplace"
  | "wallet"
  | "protocol"
  | "tool"
  | "infra";

export type AgentCommerceCategory =
  | "payments"
  | "data"
  | "infra"
  | "marketplace"
  | "auth"
  | "inference";

export type AgentCommerceProtocol =
  | "x402"
  | "http"
  | "mcp"
  | "a2a"
  | "rest"
  | "graphql"
  | "grpc";

export type AgentCommercePricingType =
  | "per_call"
  | "subscription"
  | "free"
  | "unknown";

export type AgentCommerceSourceKey =
  | "github"
  | "npm"
  | "hn"
  | "reddit"
  | "bluesky"
  | "producthunt"
  | "x402scan"
  | "agentic-market"
  | "portal-crawl"
  | "seed"
  | "manual";

export interface AgentCommercePricing {
  type: AgentCommercePricingType;
  value?: string;
  currency?: string;
  chains?: string[];
}

export interface AgentCommerceLinks {
  website?: string;
  github?: string;
  docs?: string;
  portalManifest?: string;
  callEndpoint?: string;
}

export interface AgentCommerceBadges {
  portalReady: boolean;
  agentActionable: boolean;
  x402Enabled: boolean;
  mcpServer: boolean;
  verified: boolean;
}

export interface AgentCommerceScores {
  composite: number;
  githubVelocity: number;
  socialMentions: number;
  pricingClarity: number;
  apiClarity: number;
  aisoScore: number | null;
  portalReady: number;
  hypePenalty: number;
}

export interface AgentCommerceSourceRef {
  source: AgentCommerceSourceKey;
  url: string;
  signalScore: number;
  capturedAt: string;
}

export interface AgentCommerceSocialMention {
  count: number;
  topUrl?: string;
  topTitle?: string;
}

export interface AgentCommerceLiveSnapshot {
  stars?: number;
  forks?: number;
  openIssues?: number;
  pushedAt?: string;
  updatedAt?: string;
  defaultBranch?: string;
  language?: string | null;
  hnMentions90d?: number;
  hnTopUrl?: string;
  npmName?: string;
  npmLatestVersion?: string | null;
  npmWeeklyDownloads?: number | null;
  npmRegistryUrl?: string;
  redditMentions?: AgentCommerceSocialMention;
  blueskyMentions?: AgentCommerceSocialMention;
  devtoMentions?: AgentCommerceSocialMention;
  lobstersMentions?: AgentCommerceSocialMention;
  huggingfaceSpaces?: AgentCommerceSocialMention;
  socialTotal?: number;
  // CoinGecko / token-economy enrichment
  tokenSymbol?: string;
  marketCapUsd?: number | null;
  marketCapRank?: number | null;
  priceUsd?: number | null;
  priceChange24hPct?: number | null;
  priceChange7dPct?: number | null;
  volume24hUsd?: number | null;
  fetchedAt?: string;
}

export interface AgentCommerceItem {
  id: string;
  slug: string;
  name: string;
  brief: string;
  kind: AgentCommerceKind;
  category: AgentCommerceCategory;
  protocols: AgentCommerceProtocol[];
  pricing: AgentCommercePricing;
  capabilities: string[];
  links: AgentCommerceLinks;
  badges: AgentCommerceBadges;
  scores: AgentCommerceScores;
  sources: AgentCommerceSourceRef[];
  live?: AgentCommerceLiveSnapshot;
  firstSeenAt: string;
  lastUpdatedAt: string;
  tags: string[];
}

export interface AgentCommerceFile {
  fetchedAt: string;
  source: string;
  windowDays: number;
  items: AgentCommerceItem[];
}

export interface AgentCommerceStats {
  totalItems: number;
  byKind: Record<AgentCommerceKind, number>;
  byCategory: Record<AgentCommerceCategory, number>;
  byProtocol: Record<string, number>;
  portalReadyCount: number;
  x402EnabledCount: number;
  mcpServerCount: number;
  agentActionableCount: number;
  highAisoCount: number;
  thisWeekCount: number;
  topComposite: number;
  averageComposite: number;
}
