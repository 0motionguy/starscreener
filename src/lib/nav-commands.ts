// Nav command registry — the "Pages" tier of the global ⌘K search.
//
// The Topbar search already finds repos + LLMs (via /api/search/global).
// This adds instant, client-side page-jump results so ⌘K + "funding" (or
// "watchlist", "compare"…) surfaces the destination alongside repo hits.
//
// Registry is derived from the live Sidebar nav (src/components/shell/Sidebar.tsx)
// plus the addressable top-level routes. Keep the hrefs in sync with the sidebar.

export interface NavCommand {
  /** Stable id for React keys. */
  id: string;
  /** Label shown in the row (matches the sidebar wording). */
  label: string;
  /** Sidebar group, shown as the row's right-hand meta. */
  group: string;
  /** Route to navigate to. */
  href: string;
  /** Extra match terms beyond the label. */
  keywords?: string[];
}

export const NAV_COMMANDS: NavCommand[] = [
  // Discover
  { id: "trending", label: "Trending", group: "Discover", href: "/", keywords: ["home", "repos", "hot", "dashboard"] },
  { id: "breakout", label: "Breakout", group: "Discover", href: "/breakout", keywords: ["breakouts", "surging", "accelerating"] },
  { id: "drop", label: "Drop a repo", group: "Discover", href: "/drop", keywords: ["submit", "add", "track", "surface"] },
  // Homepage category views (?cat=) — NL like "show me agents" lands here.
  { id: "cat-agents", label: "Agents", group: "View", href: "/?cat=agents", keywords: ["agent repos", "agentic", "ai agents", "autonomous"] },
  { id: "cat-llms", label: "LLMs", group: "View", href: "/?cat=llms", keywords: ["language models", "openrouter", "providers"] },
  { id: "cat-models", label: "Models", group: "View", href: "/?cat=models", keywords: ["ai models", "model adoption", "intelligence"] },
  { id: "cat-gainer", label: "Gainers", group: "View", href: "/?cat=gainer", keywords: ["top gainers", "rising", "movers"] },
  { id: "cat-discovery", label: "Discovery", group: "View", href: "/?cat=discovery", keywords: ["hidden gems", "emerging", "early", "undiscovered"] },
  // Tools
  { id: "watchlist", label: "Watchlist", group: "Tools", href: "/tools/watchlist", keywords: ["saved", "watching", "starred", "bookmarks"] },
  { id: "top-10", label: "Top 10", group: "Tools", href: "/tools/top-10", keywords: ["top10", "ranking", "leaderboard"] },
  { id: "star-history", label: "Star History", group: "Tools", href: "/tools/star-history", keywords: ["stars", "history", "growth", "chart"] },
  { id: "tier-list", label: "Tier List", group: "Tools", href: "/tools/tier-list", keywords: ["tier", "rank", "s tier"] },
  { id: "compare", label: "Compare", group: "Tools", href: "/tools/compare", keywords: ["vs", "diff", "versus"] },
  // Market
  { id: "mentions", label: "Mentions", group: "Market", href: "/market-signals", keywords: ["signals", "market", "buzz", "social"] },
  { id: "funding", label: "Funding", group: "Market", href: "/funding", keywords: ["vc", "raise", "rounds", "venture"] },
  { id: "revenue", label: "Revenue", group: "Market", href: "/revenue", keywords: ["mrr", "startups", "trustmrr"] },
  { id: "agent-commerce", label: "Agent Commerce", group: "Market", href: "/agent-commerce", keywords: ["x402", "onchain", "payments", "agents"] },
  // Account
  { id: "account", label: "Profile", group: "Account", href: "/account", keywords: ["account", "settings", "pro", "billing", "upgrade"] },
  // Resources
  { id: "categories", label: "Categories", group: "Resources", href: "/categories", keywords: ["tags", "topics"] },
  { id: "best", label: "Best Of", group: "Resources", href: "/best", keywords: ["best", "top", "recommended"] },
  { id: "collections", label: "Collections", group: "Resources", href: "/collections", keywords: ["ossinsight", "lists"] },
  { id: "blog", label: "Blog", group: "Resources", href: "/blog", keywords: ["articles", "news", "writing"] },
  { id: "glossary", label: "Glossary", group: "Resources", href: "/glossary", keywords: ["terms", "definitions", "learn"] },
];

/**
 * Case-insensitive subsequence test — every char of `q` appears in `text`
 * in order. Lets "wl" find "Watchlist", "agc" find "Agent Commerce".
 */
function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j += 1) {
    if (text[j] === q[i]) i += 1;
  }
  return i === q.length;
}

function scoreCommand(cmd: NavCommand, q: string): number {
  const label = cmd.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 85;
  if (label.includes(q)) return 65;
  if (cmd.group.toLowerCase().startsWith(q)) return 50;
  for (const kw of cmd.keywords ?? []) {
    if (kw.includes(q)) return 45;
  }
  if (isSubsequence(q, label)) return 25;
  return 0;
}

// N1 — natural-language filler. Strip leading intent verbs ("show me the
// funding page" → "funding") and trailing nouns ("page"/"tab"/"view"/"section")
// so plain-English queries resolve deterministically, no LLM call needed.
const LEADING_FILLER =
  /^(?:please\s+)?(?:go\s+to|goto|take\s+me\s+to|navigate\s+to|jump\s+to|bring\s+up|show\s+me|show|open|view|see|find|search\s+for|get\s+me|where\s+(?:is|are)|i\s+want\s+(?:to\s+see\s+)?)\s+/i;
const TRAILING_FILLER = /\s+(?:page|tab|view|section|screen)$/i;
const ARTICLES = /^(?:the|a|an|my)\s+/i;

function normalizeQuery(raw: string): string {
  let q = raw.trim().toLowerCase();
  q = q.replace(LEADING_FILLER, "");
  q = q.replace(ARTICLES, "");
  q = q.replace(TRAILING_FILLER, "");
  return q.trim();
}

/**
 * Rank pages for a query. Strips natural-language filler first (N1), then
 * scores against the registry. Returns at most `limit` matches, best first,
 * with the registry's natural order as a stable tiebreaker. Empty query
 * returns [] — the Pages tier only appears once the user starts typing.
 */
export function matchNavCommands(rawQuery: string, limit = 5): NavCommand[] {
  const q = normalizeQuery(rawQuery);
  if (!q) return [];
  return NAV_COMMANDS.map((cmd, idx) => ({ cmd, idx, score: scoreCommand(cmd, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, limit)
    .map((s) => s.cmd);
}
