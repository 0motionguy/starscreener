// Client-safe stars-by-category constants and chart projection types.

export const HERO_CATEGORIES = [
  { id: "ai-agents", label: "AI Agents", color: "#A855F7" },
  { id: "devtools", label: "DevTools", color: "#FB923C" },
  { id: "mcp", label: "MCP", color: "#14B8A6" },
  { id: "ai-ml", label: "AI/ML", color: "#3ad6c5" },
  { id: "browser-automation", label: "Browser", color: "#0EA5E9" },
  { id: "local-llm", label: "Local LLM", color: "#6366F1" },
  { id: "other", label: "Other", color: "#4b5563" },
] as const;

export type HeroCategoryId = (typeof HERO_CATEGORIES)[number]["id"];

export interface ByCategoryDay {
  d: string;
  byCategory: Partial<Record<HeroCategoryId, number>>;
}

export interface StarsByCategoryFile {
  fetchedAt: string;
  windowDays: number;
  totalRepos: number;
  missingSeries: number;
  days: ByCategoryDay[];
}

export interface ByCategoryPoint {
  /** X-axis key — YYYY-MM-DD. */
  d: string;
  /** One numeric column per category id. */
  [categoryId: string]: string | number;
}

export interface StarsByCategoryChartData {
  /** Days oldest to newest, one entry per UTC day in the window. */
  points: ByCategoryPoint[];
  /** Band keys in legend order. */
  categories: typeof HERO_CATEGORIES;
  /** ISO of the worker's last successful aggregation run. */
  fetchedAt: string;
  /** Window length the worker computed, typically 90. */
  windowDays: number;
  /** Repos covered in that aggregation. */
  totalRepos: number;
}
