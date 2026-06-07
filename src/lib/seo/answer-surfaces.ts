// Pick the highest-value answer-surface leaves to surface in the home-page
// internal-link widget. Closes the link-graph gap GSC's deep audit flagged:
// home → `/best` (hub) is fine, but no direct link signal flows from the
// highest-PageRank page on the site to any of the 12 `/best/<topic>` or 15
// `/categories/<id>` LEAVES, leaving them in "Discovered, not indexed".
//
// Source of truth in priority order:
//   1. data/_geo/gsc-baseline-latest.json — top pages by impressions, filtered
//      to /best/* + /categories/* + /glossary/* + /collections/* + /blog/*
//      leaves. Picks evergreen winners automatically once GSC has data.
//   2. CURATED_ANSWER_SURFACES — hand-picked high-value leaves for the AI-
//      tooling niche, used as the floor when GSC hasn't seen these yet (the
//      bootstrap problem — they're unindexed, so they have zero impressions,
//      so they wouldn't show up).
//
// Read on the server inside the home page; the result feeds a server-rendered
// chip widget, no client JS. Server-only: filesystem read in readBaseline().

import "server-only";

import fs from "node:fs";
import path from "node:path";

export interface AnswerSurface {
  /** Site-relative path. */
  href: string;
  /** Short user-facing label rendered inside the chip. */
  label: string;
  /** Optional category for visual grouping ("Best", "What is…", "Browse"). */
  group: "best" | "what-is" | "browse" | "deep";
}

/**
 * Hand-curated floor. Used directly when GSC data is missing or doesn't yet
 * contain enough answer-surface impressions. Order = display priority.
 * Mix of:
 *   - high-search-intent /best/* leaves (decision-intent queries)
 *   - /glossary/* definitional surfaces ("what is …" queries, AI engine bait)
 *   - the unindexed /categories/* leaves we most want Google to crawl
 */
export const CURATED_ANSWER_SURFACES: AnswerSurface[] = [
  // /best/* — decision intent
  { href: "/best/ai-agents", label: "Best AI agents", group: "best" },
  { href: "/best/mcp-servers", label: "Best MCP servers", group: "best" },
  { href: "/best/ai-coding-assistants", label: "Best coding copilots", group: "best" },
  { href: "/best/local-llm-tools", label: "Best local LLM tools", group: "best" },
  { href: "/best/vector-databases", label: "Best vector DBs", group: "best" },
  { href: "/best/self-hosted-ai", label: "Best self-hosted AI", group: "best" },

  // /glossary/* — definitional intent
  { href: "/glossary/mcp", label: "What is MCP?", group: "what-is" },
  { href: "/glossary/ai-agent", label: "What is an AI agent?", group: "what-is" },
  { href: "/glossary/rag", label: "What is RAG?", group: "what-is" },
  { href: "/glossary/vector-database", label: "What is a vector DB?", group: "what-is" },

  // /categories/* — leaderboard intent (the unindexed ones we most want signal to)
  { href: "/categories/ai-agents", label: "Trending AI agents", group: "browse" },
  { href: "/categories/mcp", label: "Trending MCP", group: "browse" },
];

const ANSWER_SURFACE_PATTERN =
  /^https?:\/\/[^/]+(\/(?:best|categories|glossary|collections|blog)\/[^?#]+)$/;

interface GscPageRow {
  clicks?: number;
  impressions?: number;
  keys?: string[];
}

interface GscBaselineFile {
  pages?: GscPageRow[];
}

/** Read the baseline JSON if it's present and within an acceptable age window. */
function readBaseline(): GscBaselineFile | null {
  try {
    const p = path.join(process.cwd(), "data", "_geo", "gsc-baseline-latest.json");
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as GscBaselineFile;
  } catch {
    return null;
  }
}

/**
 * Pull the top N answer-surface leaves from the latest GSC baseline.
 * Returns [] when the file is missing or contains zero answer-surface rows
 * (the bootstrap case — caller falls back to CURATED_ANSWER_SURFACES).
 */
export function readGscAnswerSurfaces(limit = 12): AnswerSurface[] {
  const file = readBaseline();
  if (!file?.pages) return [];

  const rows = file.pages.filter((r) => {
    if (!r.keys?.[0]) return false;
    return ANSWER_SURFACE_PATTERN.test(r.keys[0]);
  });
  // Already impressions-ranked by gsc-baseline; preserve that order, slice.
  return rows.slice(0, limit).map((r) => {
    const url = r.keys![0];
    const match = ANSWER_SURFACE_PATTERN.exec(url);
    const href = match?.[1] ?? "/";
    return {
      href,
      label: labelFromHref(href),
      group: groupFromHref(href),
    };
  });
}

/**
 * Pick the home widget's display list. Priority: GSC top leaves (≥6 matches)
 * → curated floor → return empty so the widget hides itself.
 */
export function pickAnswerSurfaces(opts: { limit?: number } = {}): AnswerSurface[] {
  const limit = opts.limit ?? 12;
  const gsc = readGscAnswerSurfaces(limit);
  // Threshold of 6: only trust GSC once it has at least half a row's worth
  // of answer-surface signal. Otherwise the widget would chase noise and
  // promote the few accidentally-indexed leaves at the expense of the high-
  // intent unindexed targets the link signal is meant to lift.
  if (gsc.length >= 6) return gsc;
  return CURATED_ANSWER_SURFACES.slice(0, limit);
}

function labelFromHref(href: string): string {
  if (href.startsWith("/best/")) {
    const slug = href.replace("/best/", "");
    return `Best ${humanise(slug)}`;
  }
  if (href.startsWith("/categories/")) {
    const slug = href.replace("/categories/", "");
    return `Trending ${humanise(slug)}`;
  }
  if (href.startsWith("/glossary/")) {
    const slug = href.replace("/glossary/", "");
    return `What is ${humanise(slug)}?`;
  }
  if (href.startsWith("/collections/")) {
    const slug = href.replace("/collections/", "");
    return humanise(slug);
  }
  if (href.startsWith("/blog/")) {
    const slug = href.replace("/blog/", "");
    return humanise(slug);
  }
  return href;
}

function humanise(slug: string): string {
  return slug
    .split("-")
    .map((p) => (p === "ai" || p === "ml" || p === "mcp" || p === "llm" || p === "rag" ? p.toUpperCase() : p))
    .join(" ");
}

function groupFromHref(href: string): AnswerSurface["group"] {
  if (href.startsWith("/best/")) return "best";
  if (href.startsWith("/glossary/")) return "what-is";
  if (href.startsWith("/categories/")) return "browse";
  return "deep";
}
