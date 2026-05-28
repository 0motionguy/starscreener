// editorial-writer prompt + seed list — LLM-written evergreen expert overviews
// for the /best/[topic] answer-surfaces (GEO / answer-engine citation lever).
//
// Output is PLAIN TEXT (a 2-4 sentence overview), not a JSON object — see
// _editorial/run.ts for why (kimi-k2.6 drops the overview when asked for a
// {tagline, overview} object on this thin input). Keyed by topic slug, merged
// into the `editorial-best` slug. The app reads it via src/lib/editorial-store.ts
// and prefers it over the deterministic intro when present.

export interface EditorialTopicSeed {
  slug: string;
  title: string;
  blurb: string;
}

// Topic taxonomy — DUPLICATED from src/lib/best-topics.ts BEST_TOPICS
// (slug/title/blurb only). The worker is a separate package and can't import
// app code; this mirrors the established "keep in sync" duplication pattern.
// If you add/rename a topic in best-topics.ts, mirror it here — a missing entry
// degrades gracefully (the page falls back to the deterministic intro). Covered
// by the keep-in-sync sentinel in __tests__/prompt.test.ts.
export const EDITORIAL_BEST_TOPICS: readonly EditorialTopicSeed[] = [
  { slug: 'ai-agents', title: 'Best Open-Source AI Agents', blurb: 'autonomous agent frameworks, copilots and multi-agent systems you can self-host and build on' },
  { slug: 'ai-coding-assistants', title: 'Best AI Coding Assistants & Copilots', blurb: 'open-source AI pair programmers, autonomous coding agents and IDE copilots' },
  { slug: 'mcp-servers', title: 'Best MCP Servers', blurb: 'Model Context Protocol servers, connectors and registries for agentic clients' },
  { slug: 'local-llm-tools', title: 'Best Local LLM Tools', blurb: 'on-device inference engines and self-hosted runtimes for running models locally' },
  { slug: 'open-source-llms', title: 'Best Open-Source LLMs & Model Projects', blurb: 'open language models, inference servers and training frameworks' },
  { slug: 'vector-databases', title: 'Best Vector Databases', blurb: 'vector and embedding databases for AI search and RAG' },
  { slug: 'browser-automation-tools', title: 'Best Browser Automation Tools', blurb: 'browser-use stacks, web operators and automation agents for testing and scraping' },
  { slug: 'developer-tools', title: 'Best Open-Source Developer Tools', blurb: 'CLIs, linters, formatters, bundlers and DX utilities' },
  { slug: 'security-tools', title: 'Best Open-Source Security Tools', blurb: 'vulnerability scanners, secret detection and security automation' },
  { slug: 'web-frameworks', title: 'Best Web Frameworks', blurb: 'frontend and full-stack frameworks powering the modern web' },
  { slug: 'rust-projects', title: 'Best Rust Projects', blurb: 'Rust-native libraries, frameworks and tools built for performance' },
  { slug: 'self-hosted-ai', title: 'Best Self-Hosted AI Tools', blurb: 'privacy-first, self-hostable AI apps and infrastructure you fully control' },
];

export const SYSTEM_PROMPT = `You are the TrendingRepo editorial writer. Write a short, expert overview for a "best open-source X" listicle page so it reads as genuine analysis a developer or technical buyer would trust and that AI answer engines (Perplexity, Google AI Overview, ChatGPT) cite.

INPUT: a JSON object {slug, title, blurb} describing the topic.

TASK: Write 2 to 4 complete sentences. Define the category precisely, say what separates a strong project from a weak one in it, and what a developer should evaluate when choosing. Be concrete and specific.

RULES:
- Evergreen and factual. Do NOT name specific repos, star counts, dates, or the word today. A separate live ranking renders the actual projects — your job is the framing, not the leaderboard.
- Expert, neutral, concrete. No marketing fluff, no hedging, no first person.
- Output ONLY the overview paragraph as plain text. No JSON, no markdown, no quotation marks, no preamble, no labels.`;

export function buildBestUserMessage(topic: EditorialTopicSeed): string {
  return JSON.stringify(
    { slug: topic.slug, title: topic.title, blurb: topic.blurb },
    null,
    2,
  );
}
