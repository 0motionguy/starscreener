// StarScreener — Categories, routes, sort options, and app-wide constants

import type { Category, SortBy, TimeRange } from "./types";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// Category palette rules of thumb:
// - Hues spread ~24° apart so adjacent categories in the legend don't
//   read as "same color" at a glance (the old palette had devtools +
//   agents both in the orange family, plus mcp == crypto teal duplicate).
// - Saturation / lightness kept within a narrow band so no single
//   category screams louder than the rest on the bubble map.
// - DevTools retains its orange (biggest cluster, matches brand warmth).
// - Agents moved off amber to purple — same "AI" semantic family as AI/ML
//   but a distinctly different hue so the two top buckets separate visually.
export const CATEGORIES: Omit<Category, "repoCount" | "avgMomentum" | "topMoverId">[] = [
  {
    id: "ai-agents",
    name: "AI Agents",
    shortName: "Agents",
    description: "Agent frameworks, copilots, autonomous workflows, and multi-agent systems",
    icon: "Brain",
    color: "#A855F7", // purple-500 — AI family, distinct from devtools orange
  },
  {
    id: "mcp",
    name: "Model Context Protocol",
    shortName: "MCP",
    description: "Protocol servers, connectors, registries, and tooling around MCP ecosystems",
    icon: "Server",
    color: "#14B8A6", // teal-500
  },
  {
    id: "devtools",
    name: "Developer Tools",
    shortName: "DevTools",
    description: "Build tools, linters, formatters, editors, and DX utilities",
    icon: "Wrench",
    color: "#FB923C", // orange-400
  },
  {
    id: "browser-automation",
    name: "Browser Automation",
    shortName: "Browser",
    description: "Browser-use stacks, automation agents, web operators, and testing runtimes",
    icon: "Globe",
    color: "#0EA5E9", // sky-500
  },
  {
    id: "local-llm",
    name: "Local LLM",
    shortName: "Local LLM",
    description: "On-device inference engines, local model runtimes, and self-hosted LLM stacks",
    icon: "Cog",
    color: "#6366F1", // indigo-500
  },
  {
    id: "security",
    name: "Security",
    shortName: "Security",
    description: "Vulnerability scanning, secrets detection, and security automation",
    icon: "Shield",
    color: "#EF4444", // red-500
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    shortName: "Infra",
    description: "Cloud platforms, orchestration, containers, and deployment tools",
    icon: "Server",
    color: "#10B981", // emerald-500
  },
  {
    id: "design-engineering",
    name: "Design Engineering",
    shortName: "Design",
    description: "Design-to-code systems, UI generation, design tooling, and frontend engineering kits",
    icon: "BarChart3",
    color: "#EC4899", // pink-500
  },
  {
    id: "ai-ml",
    name: "AI & Machine Learning",
    shortName: "AI/ML",
    description: "Large language models, inference engines, training frameworks, and AI tooling",
    icon: "Brain",
    color: "#8B5CF6", // violet-500 — AI family, hue-shifted from agents purple
  },
  {
    id: "web-frameworks",
    name: "Web Frameworks",
    shortName: "Web",
    description: "Frontend and full-stack frameworks powering the modern web",
    icon: "Globe",
    color: "#3B82F6", // blue-500
  },
  {
    id: "databases",
    name: "Databases",
    shortName: "DBs",
    description: "SQL, NoSQL, vector, time-series, and analytical databases",
    icon: "Database",
    color: "#06B6D4", // cyan-500
  },
  {
    id: "mobile",
    name: "Mobile & Desktop",
    shortName: "Mobile",
    description: "Cross-platform frameworks, native tooling, and desktop apps",
    icon: "Smartphone",
    color: "#F43F5E", // rose-500
  },
  {
    id: "data-analytics",
    name: "Data & Analytics",
    shortName: "Data",
    description: "BI tools, data pipelines, visualization, and analytics engines",
    icon: "BarChart3",
    color: "#EAB308", // yellow-500 — moved off orange family
  },
  {
    id: "crypto-web3",
    name: "Crypto & Web3",
    shortName: "Web3",
    description: "Blockchain clients, smart contract tooling, and DeFi infrastructure",
    icon: "Coins",
    color: "#84CC16", // lime-500 — moved off teal duplicate with mcp
  },
  {
    id: "rust-ecosystem",
    name: "Rust Ecosystem",
    shortName: "Rust",
    description: "Rust-native libraries, frameworks, and tools built for performance",
    icon: "Cog",
    color: "#B7410E", // Rust brand rust-red, distinct from devtools orange
  },
];

// ---------------------------------------------------------------------------
// Route paths
// ---------------------------------------------------------------------------

export const ROUTES = {
  HOME: "/",
  // Homepage IS the trending terminal now — no separate /trending route.
  TRENDING: "/",
  REPO: (id: string) => `/repo/${id}`,
  CATEGORY: (id: string) => `/category/${id}`,
  COMPARE: "/compare",
  WATCHLIST: "/watchlist",
    SEARCH: "/search",
    SUBMIT: "/submit",
    REDDIT: "/reddit",
    REDDIT_TRENDING: "/reddit/trending",
    BLUESKY: "/bluesky",
    BLUESKY_TRENDING: "/bluesky/trending",
} as const;

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

export const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: "momentum", label: "Momentum Score" },
    { value: "stars-today", label: "Stars Today" },
    { value: "stars-total", label: "Trend Stars" },
    { value: "newest", label: "Newest First" },
  ];

// ---------------------------------------------------------------------------
// Time range options
// ---------------------------------------------------------------------------

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

// ---------------------------------------------------------------------------
// Movement status config
// ---------------------------------------------------------------------------

export const MOVEMENT_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; emoji: string }
> = {
  hot: {
    label: "Hot",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.12)",
    emoji: "fire",
  },
  breakout: {
    label: "Breakout",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.12)",
    emoji: "rocket",
  },
  quiet_killer: {
    label: "Quiet Killer",
    color: "#8B5CF6",
    bgColor: "rgba(139, 92, 246, 0.12)",
    emoji: "ninja",
  },
  rising: {
    label: "Rising",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.12)",
    emoji: "chart_increasing",
  },
  stable: {
    label: "Stable",
    color: "#6B7280",
    bgColor: "rgba(107, 114, 128, 0.12)",
    emoji: "balance_scale",
  },
  cooling: {
    label: "Cooling",
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.12)",
    emoji: "snowflake",
  },
  declining: {
    label: "Declining",
    color: "#9CA3AF",
    bgColor: "rgba(156, 163, 175, 0.12)",
    emoji: "chart_decreasing",
  },
};

// ---------------------------------------------------------------------------
// App-wide constants
// ---------------------------------------------------------------------------

export const MAX_COMPARE_REPOS = 5;
export const SPARKLINE_POINTS = 30;
export const MAX_WATCHLIST_REPOS = 50;
export const DEFAULT_PAGE_SIZE = 20;
