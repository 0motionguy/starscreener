// StarScreener — Agent-tool result types.
//
// These are the response shapes returned by tool handlers. They are the
// single source of truth for both the Portal envelope payload and the MCP
// tool result. When a future version of a tool grows new fields, add a
// `*Full` variant (e.g. MaintainerProfileFull) alongside the existing one
// rather than mutating the shape — Portal/MCP clients rely on stable
// contracts.

/** Compact repo shape returned by top_gainers / search_repos / maintainer_profile. */
export interface RepoCard {
  full_name: string; // "vercel/next.js"
  owner: string; // "vercel"
  name: string; // "next.js"
  description: string;
  url: string;
  language: string | null;
  stars: number;
  stars_delta_24h: number;
  stars_delta_7d: number;
  stars_delta_30d: number;
  momentum_score: number; // 0-100
  movement_status: string; // "hot" | "breakout" | ...
  category_id: string;
  topics: string[];
}

export interface TopGainersResult {
  window: "24h" | "7d" | "30d";
  count: number;
  repos: RepoCard[];
}

export interface SearchReposResult {
  query: string;
  count: number;
  repos: RepoCard[];
}

/**
 * Minimal-viable maintainer profile composed from repos the Star Screener
 * index already owns where `owner === handle`. Named `Minimal` so a future
 * `MaintainerProfileFull` variant (with live GitHub cross-repo contributor
 * data) can ship without breaking existing clients.
 */
export interface MaintainerProfileMinimal {
  handle: string;
  repo_count: number;
  total_stars: number;
  total_stars_delta_7d: number;
  languages: string[]; // unique, sorted desc by repo count
  category_ids: string[]; // unique, sorted desc by repo count
  top_repos: RepoCard[]; // up to 5, sorted by momentum desc
  /** Honest disclosure — LLMs should read this so they don't overclaim coverage. */
  scope_note: string;
}
