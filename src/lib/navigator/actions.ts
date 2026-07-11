// Navigator command registry — the deterministic tier of the ⌘K palette.
//
// Kept intentionally free of React + icon imports so it can be pulled into
// the lazy Navigator bundle without dragging chrome dependencies along
// (same rationale as routes.ts staying separate from constants.ts).
//
// N0 covers navigation destinations. N1 will graft repo-filter actions
// (useFilterStore) and an NL fall-through onto the same registry.

export interface NavCommand {
  /** Stable id for keys + analytics. */
  id: string;
  /** Human label shown in the row. */
  label: string;
  /** Terminal section this destination belongs to (uppercase micro-label). */
  section: string;
  /** Route to push on select. */
  href: string;
  /** Extra match terms beyond the label (synonyms, source names). */
  keywords?: string[];
}

// Curated from the sidebar terminals (SidebarContent.tsx) + SITE-WIREMAP.
// Order is the natural reading order; the matcher re-ranks by relevance.
export const NAV_COMMANDS: NavCommand[] = [
  // TREND
  { id: "home", label: "Home", section: "TREND", href: "/", keywords: ["dashboard", "trending", "overview"] },
  { id: "githubrepo", label: "Trending Repos", section: "TREND", href: "/githubrepo", keywords: ["github", "repos", "hot"] },
  { id: "breakouts", label: "Breakouts", section: "TREND", href: "/breakouts", keywords: ["breakout", "surging", "cross signal"] },
  { id: "skills", label: "Trending Skills", section: "TREND", href: "/skills", keywords: ["claude", "skill", "agent skills"] },
  { id: "mcp", label: "Trending MCP", section: "TREND", href: "/mcp", keywords: ["model context protocol", "servers", "smithery"] },
  { id: "agent-repos", label: "Trending AGNT", section: "TREND", href: "/agent-repos", keywords: ["agents", "agentic"] },
  { id: "consensus", label: "Consensus", section: "TREND", href: "/consensus", keywords: ["verdict", "agreement"] },
  { id: "top", label: "Top 100", section: "TREND", href: "/top", keywords: ["ranking", "leaderboard"] },

  // SIGNAL
  { id: "signals", label: "Market Signals", section: "SIGNAL", href: "/signals", keywords: ["radar", "signal"] },
  { id: "hackernews", label: "Hacker News", section: "SIGNAL", href: "/hackernews/trending", keywords: ["hn", "ycombinator"] },
  { id: "lobsters", label: "Lobsters", section: "SIGNAL", href: "/lobsters", keywords: ["lobste.rs"] },
  { id: "devto", label: "Dev.to", section: "SIGNAL", href: "/devto", keywords: ["dev to", "articles"] },
  { id: "bluesky", label: "Bluesky", section: "SIGNAL", href: "/bluesky/trending", keywords: ["bsky", "atproto"] },
  { id: "reddit", label: "Reddit", section: "SIGNAL", href: "/reddit/trending", keywords: ["subreddit"] },
  { id: "twitter", label: "X (Twitter)", section: "SIGNAL", href: "/twitter", keywords: ["x", "tweets"] },
  { id: "producthunt", label: "Product Hunt", section: "SIGNAL", href: "/producthunt", keywords: ["ph", "launches"] },

  // PACK
  { id: "npm", label: "NPM Packages", section: "PACK", href: "/npm", keywords: ["node", "packages", "downloads"] },
  { id: "huggingface", label: "HF Models", section: "PACK", href: "/huggingface/trending", keywords: ["hugging face", "models", "ml"] },

  // LAUNCH
  { id: "funding", label: "Funding Radar", section: "LAUNCH", href: "/funding", keywords: ["vc", "rounds", "raise"] },
  { id: "revenue", label: "Revenue", section: "LAUNCH", href: "/revenue", keywords: ["mrr", "trustmrr", "startups"] },
  { id: "agent-commerce", label: "Agent Commerce", section: "LAUNCH", href: "/agent-commerce", keywords: ["x402", "onchain", "payments"] },

  // RESEARCH
  { id: "arxiv", label: "arXiv Papers", section: "RESEARCH", href: "/arxiv/trending", keywords: ["research", "papers", "preprint"] },
  { id: "research", label: "Cited Repos", section: "RESEARCH", href: "/research", keywords: ["citations"] },

  // EXPLORE
  { id: "digest", label: "Digest", section: "EXPLORE", href: "/digest", keywords: ["weekly", "email"] },
  { id: "ideas", label: "Ideas", section: "EXPLORE", href: "/ideas", keywords: ["build ideas"] },
  { id: "categories", label: "Categories", section: "EXPLORE", href: "/categories", keywords: ["tags", "topics"] },
  { id: "collections", label: "Collections", section: "EXPLORE", href: "/collections", keywords: ["ossinsight"] },

  // TOOLS
  { id: "watchlist", label: "Watchlist", section: "TOOLS", href: "/watchlist", keywords: ["watching", "saved", "starred"] },
  { id: "compare", label: "Compare", section: "TOOLS", href: "/compare", keywords: ["vs", "diff"] },
  { id: "tierlist", label: "Tier List", section: "TOOLS", href: "/tierlist", keywords: ["tier", "rank"] },
  { id: "top10", label: "Top 10", section: "TOOLS", href: "/top10", keywords: ["daily", "snapshot"] },
  { id: "alerts", label: "Alerts", section: "TOOLS", href: "/alerts", keywords: ["notify", "rules"] },
  { id: "submit", label: "Drop a Repo", section: "TOOLS", href: "/submit", keywords: ["add", "track", "submit"] },
  { id: "pricing", label: "Plans", section: "TOOLS", href: "/pricing", keywords: ["pricing", "billing", "upgrade"] },
];

/**
 * Case-insensitive subsequence test — every char of `q` appears in `text`
 * in order (the classic fuzzy-finder contains). Powers the low-tier match
 * so "hnews" still finds "Hacker News".
 */
function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j += 1) {
    if (text[j] === q[i]) i += 1;
  }
  return i === q.length;
}

/**
 * Score a command against a normalized (lowercased, trimmed) query.
 * Returns 0 for no match. Higher is better; label hits beat keyword hits,
 * prefix beats substring beats fuzzy.
 */
function scoreCommand(cmd: NavCommand, q: string): number {
  const label = cmd.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 85;
  if (label.includes(q)) return 65;
  const section = cmd.section.toLowerCase();
  if (section.startsWith(q)) return 55;
  for (const kw of cmd.keywords ?? []) {
    if (kw.includes(q)) return 45;
  }
  if (isSubsequence(q, label)) return 25;
  return 0;
}

/**
 * Rank nav commands for a query. Empty query returns a curated default
 * set (the "GO TO" list shown before the user types). Ties break on the
 * registry's natural order so results are deterministic.
 */
export function matchNavCommands(rawQuery: string, limit = 8): NavCommand[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return NAV_COMMANDS.filter((c) =>
      ["home", "breakouts", "skills", "mcp", "signals", "watchlist", "compare"].includes(c.id),
    );
  }
  const scored = NAV_COMMANDS.map((cmd, idx) => ({ cmd, idx, score: scoreCommand(cmd, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return scored.slice(0, limit).map((s) => s.cmd);
}
