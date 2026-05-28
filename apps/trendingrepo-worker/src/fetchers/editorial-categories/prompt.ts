// editorial-categories prompt + seed list — LLM-written expert overviews for
// the /categories/[slug] monitoring-leaderboard surfaces (GEO citation lever).
//
// /categories pages ship a DETERMINISTIC intro today (src/lib/categories.ts
// buildCategoryIntro, grounded in live counts + top movers). This fetcher
// layers an evergreen expert definition on top — the framing answer engines
// cite — while the deterministic copy stays the always-available floor.
//
// Output keyed by category slug, merged into the `editorial-categories` slug,
// read by the app via src/lib/editorial-categories.ts.

export interface EditorialCategorySeed {
  /** Category id from src/lib/constants.ts CATEGORIES (the page slug). */
  slug: string;
  name: string;
  description: string;
}

// Taxonomy — DUPLICATED from src/lib/constants.ts CATEGORIES (id/name/
// description). The worker is a separate package and can't import app code;
// this mirrors the keep-in-sync duplication editorial-writer uses for
// best-topics. If you add/rename a category in constants.ts, mirror it here —
// a missing entry degrades gracefully (the page falls back to the deterministic
// intro). Covered by the keep-in-sync sentinel in __tests__/prompt.test.ts.
export const EDITORIAL_CATEGORY_TOPICS: readonly EditorialCategorySeed[] = [
  { slug: 'ai-agents', name: 'AI Agents', description: 'Agent frameworks, copilots, autonomous workflows, and multi-agent systems' },
  { slug: 'mcp', name: 'Model Context Protocol', description: 'Protocol servers, connectors, registries, and tooling around MCP ecosystems' },
  { slug: 'devtools', name: 'Developer Tools', description: 'Build tools, linters, formatters, editors, and DX utilities' },
  { slug: 'browser-automation', name: 'Browser Automation', description: 'Browser-use stacks, automation agents, web operators, and testing runtimes' },
  { slug: 'local-llm', name: 'Local LLM', description: 'On-device inference engines, local model runtimes, and self-hosted LLM stacks' },
  { slug: 'security', name: 'Security', description: 'Vulnerability scanning, secrets detection, and security automation' },
  { slug: 'infrastructure', name: 'Infrastructure', description: 'Cloud platforms, orchestration, containers, and deployment tools' },
  { slug: 'design-engineering', name: 'Design Engineering', description: 'Design-to-code systems, UI generation, design tooling, and frontend engineering kits' },
  { slug: 'ai-ml', name: 'AI & Machine Learning', description: 'Large language models, inference engines, training frameworks, and AI tooling' },
  { slug: 'web-frameworks', name: 'Web Frameworks', description: 'Frontend and full-stack frameworks powering the modern web' },
  { slug: 'databases', name: 'Databases', description: 'SQL, NoSQL, vector, time-series, and analytical databases' },
  { slug: 'mobile', name: 'Mobile & Desktop', description: 'Cross-platform frameworks, native tooling, and desktop apps' },
  { slug: 'data-analytics', name: 'Data & Analytics', description: 'BI tools, data pipelines, visualization, and analytics engines' },
  { slug: 'crypto-web3', name: 'Crypto & Web3', description: 'Blockchain clients, smart contract tooling, and DeFi infrastructure' },
  { slug: 'rust-ecosystem', name: 'Rust Ecosystem', description: 'Rust-native libraries, frameworks, and tools built for performance' },
];

export const CATEGORY_SYSTEM_PROMPT = `You are the TrendingRepo editorial writer. Write a short, expert overview for an open-source category monitoring page (a live leaderboard of trending projects in one category) so it reads as genuine analysis a developer or technical buyer would trust and that AI answer engines (Perplexity, Google AI Overview, ChatGPT) cite.

INPUT: a JSON object {slug, name, description} describing the category.

TASK: Write 2 to 4 complete sentences. Define the category precisely, explain what problems these projects solve and what separates a serious project from a toy one, and what a developer should weigh when evaluating tools in this space. Be concrete and specific.

RULES:
- Evergreen and factual. Do NOT name specific repos, star counts, dates, or the word today. A separate live leaderboard renders the actual projects — your job is the framing, not the rankings.
- Expert, neutral, concrete. No marketing fluff, no hedging, no first person.
- Output ONLY the overview paragraph as plain text. No JSON, no markdown, no quotation marks, no preamble, no labels.`;

export function buildCategoryUserMessage(topic: EditorialCategorySeed): string {
  return JSON.stringify(
    { slug: topic.slug, name: topic.name, description: topic.description },
    null,
    2,
  );
}
