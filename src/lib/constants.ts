// StarScreener — Categories, routes, sort options, and app-wide constants

import type { Category, SortBy, TimeRange } from "./types";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORIES: Omit<Category, "repoCount" | "avgMomentum" | "topMoverId">[] = [
  {
    id: "ai-ml",
    name: "AI & Machine Learning",
    shortName: "AI/ML",
    description: "Large language models, inference engines, training frameworks, and AI tooling",
    icon: "Brain",
    color: "#8B5CF6", // violet
  },
  {
    id: "web-frameworks",
    name: "Web Frameworks",
    shortName: "Web",
    description: "Frontend and full-stack frameworks powering the modern web",
    icon: "Globe",
    color: "#3B82F6", // blue
  },
  {
    id: "devtools",
    name: "Developer Tools",
    shortName: "DevTools",
    description: "Build tools, linters, formatters, editors, and DX utilities",
    icon: "Wrench",
    color: "#F59E0B", // amber
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    shortName: "Infra",
    description: "Cloud platforms, orchestration, containers, and deployment tools",
    icon: "Server",
    color: "#10B981", // emerald
  },
  {
    id: "databases",
    name: "Databases",
    shortName: "DBs",
    description: "SQL, NoSQL, vector, time-series, and analytical databases",
    icon: "Database",
    color: "#06B6D4", // cyan
  },
  {
    id: "security",
    name: "Security",
    shortName: "Security",
    description: "Vulnerability scanning, secrets detection, and security automation",
    icon: "Shield",
    color: "#EF4444", // red
  },
  {
    id: "mobile",
    name: "Mobile & Desktop",
    shortName: "Mobile",
    description: "Cross-platform frameworks, native tooling, and desktop apps",
    icon: "Smartphone",
    color: "#EC4899", // pink
  },
  {
    id: "data-analytics",
    name: "Data & Analytics",
    shortName: "Data",
    description: "BI tools, data pipelines, visualization, and analytics engines",
    icon: "BarChart3",
    color: "#F97316", // orange
  },
  {
    id: "crypto-web3",
    name: "Crypto & Web3",
    shortName: "Web3",
    description: "Blockchain clients, smart contract tooling, and DeFi infrastructure",
    icon: "Coins",
    color: "#14B8A6", // teal
  },
  {
    id: "rust-ecosystem",
    name: "Rust Ecosystem",
    shortName: "Rust",
    description: "Rust-native libraries, frameworks, and tools built for performance",
    icon: "Cog",
    color: "#D97706", // dark amber / rust
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
} as const;

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

export const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "momentum", label: "Momentum Score" },
  { value: "stars-today", label: "Stars Today" },
  { value: "stars-total", label: "Total Stars" },
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

export const MAX_COMPARE_REPOS = 4;
export const SPARKLINE_POINTS = 30;
export const MAX_WATCHLIST_REPOS = 50;
export const DEFAULT_PAGE_SIZE = 20;
