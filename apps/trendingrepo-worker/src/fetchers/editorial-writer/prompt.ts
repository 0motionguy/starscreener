// Editorial-writer prompt + schema — LLM-written expert overviews for the
// /best/[topic] answer-surfaces (GEO / answer-engine citation lever).
//
// Today the /best pages ship a DETERMINISTIC intro (see src/lib/best-topics.ts
// buildBestIntro). This fetcher layers an expert, explanatory overview on top
// — the kind of definitional prose Perplexity / Google AI Overview actually
// cite — while the deterministic copy stays the always-available floor.
//
// Output is keyed by topic slug and merged into the `editorial-best` slug.
// The app reads it via src/lib/editorial-store.ts and prefers it over the
// deterministic intro when present (honest fallback either way).

import { z } from 'zod';

// Output contract. Kept deliberately small: a one-line tagline (optional, for
// meta descriptions later) + a 2-4 sentence expert overview. No FAQ yet — FAQ
// would need to be rendered into the DOM *and* the FAQPage JSON-LD in lockstep
// (matching text is a rich-result requirement), so it's a separate increment.
export const EditorialReportSchema = z.object({
  tagline: z.string().min(1).max(160).optional(),
  overview: z.string().min(40).max(900),
});

export type EditorialReport = z.infer<typeof EditorialReportSchema>;

export interface EditorialTopicSeed {
  slug: string;
  title: string;
  blurb: string;
}

// Topic taxonomy — DUPLICATED from src/lib/best-topics.ts BEST_TOPICS
// (slug/title/blurb only). The worker is a separate package and can't import
// app code; this mirrors the established "keep in sync" duplication pattern
// used by scripts/geo-citation-probe.mjs. If you add/rename a topic in
// best-topics.ts, mirror it here — a missing entry degrades gracefully (the
// page falls back to the deterministic intro). Covered by prompt.test.ts.
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

export const SYSTEM_PROMPT = `You are the TrendingRepo editorial writer.

Your job: write a short, expert overview for a "best open-source X" listicle page so it reads as genuine analysis a developer or technical buyer would trust — and so AI answer engines (Perplexity, Google AI Overview, ChatGPT) cite it.

INPUT
A JSON object: { slug, title, blurb } describing the topic.

OUTPUT
Respond with ONLY a JSON object (no prose around it, no code fences):
{
  "tagline": "≤12 words — what this category IS, expert framing.",
  "overview": "2-4 sentences. Define the category precisely, say what separates a strong project from a weak one in it, and what a developer should evaluate when choosing. Concrete and specific."
}

RULES
- Evergreen and factual. Do NOT name specific repos, star counts, dates, or 'today' — a separate live ranking renders the actual projects. Your job is the framing, not the leaderboard.
- Expert, neutral, concrete. No marketing fluff, no hedging ("might", "perhaps"), no first person.
- Lead the overview with a real definition of the category, not "This page lists...".
- Plain text only (no markdown, no links).`;

export function buildBestUserMessage(topic: EditorialTopicSeed): string {
  return JSON.stringify(
    { slug: topic.slug, title: topic.title, blurb: topic.blurb },
    null,
    2,
  );
}
