// "Best of" topic registry — the curated, high-intent listicle surfaces at
// /best/[topic].
//
// These are intentionally DISTINCT from /categories/[slug]:
//   - categories = the full dense momentum leaderboard (monitoring intent)
//   - best       = a curated, verdict-forward editorial top-N (decision intent)
// Topics are often cross-cuts (e.g. "AI coding assistants" spans ai-agents +
// devtools) that no single category captures, so the two surfaces don't
// duplicate each other. Each entry's "why it ranks" blurb is pulled from the
// real consensus verdict where one exists (genuine differentiation, not a
// re-skinned table), with a deterministic data-grounded fallback otherwise.

import { getDerivedRepos } from "@/lib/derived-repos";
import { getEditorialBest } from "@/lib/editorial-store";
import type { FaqEntry } from "@/lib/seo/structured-data";
import type { Repo } from "@/lib/types";

export interface BestTopic {
  slug: string;
  /** H1 / page title, e.g. "Best Open-Source AI Agents". */
  title: string;
  /** One-line definition of the topic for intro + meta description. */
  blurb: string;
  /** Restrict to these classification categories (empty = any). */
  categoryIds: string[];
  /** Require one of these substrings in name/description/topics (empty = any). */
  keywords: string[];
}

export const BEST_TOPICS: BestTopic[] = [
  {
    slug: "ai-agents",
    title: "Best Open-Source AI Agents",
    blurb:
      "autonomous agent frameworks, copilots and multi-agent systems you can self-host and build on",
    categoryIds: ["ai-agents"],
    keywords: [],
  },
  {
    slug: "ai-coding-assistants",
    title: "Best AI Coding Assistants & Copilots",
    blurb:
      "open-source AI pair programmers, autonomous coding agents and IDE copilots",
    categoryIds: ["ai-agents", "devtools"],
    keywords: [
      "coding agent",
      "coding assistant",
      "copilot",
      "pair program",
      "ai code",
      "code editor",
      "autocomplete",
      "aider",
      "cline",
      "software engineer",
    ],
  },
  {
    slug: "mcp-servers",
    title: "Best MCP Servers",
    blurb:
      "Model Context Protocol servers, connectors and registries for agentic clients",
    categoryIds: ["mcp"],
    keywords: [],
  },
  {
    slug: "local-llm-tools",
    title: "Best Local LLM Tools",
    blurb:
      "on-device inference engines and self-hosted runtimes for running models locally",
    categoryIds: ["local-llm"],
    keywords: [],
  },
  {
    slug: "open-source-llms",
    title: "Best Open-Source LLMs & Model Projects",
    blurb:
      "open language models, inference servers and training frameworks",
    categoryIds: ["ai-ml", "local-llm"],
    keywords: [
      "llm",
      "language model",
      "llama",
      "mistral",
      "qwen",
      "deepseek",
      "gemma",
      "inference",
      "transformer",
      "model",
    ],
  },
  {
    slug: "vector-databases",
    title: "Best Vector Databases",
    blurb: "vector and embedding databases for AI search and RAG",
    categoryIds: ["databases"],
    keywords: ["vector", "embedding", "rag", "semantic", "ann", "similarity"],
  },
  {
    slug: "browser-automation-tools",
    title: "Best Browser Automation Tools",
    blurb:
      "browser-use stacks, web operators and automation agents for testing and scraping",
    categoryIds: ["browser-automation"],
    keywords: [],
  },
  {
    slug: "developer-tools",
    title: "Best Open-Source Developer Tools",
    blurb: "CLIs, linters, formatters, bundlers and DX utilities",
    categoryIds: ["devtools"],
    keywords: [],
  },
  {
    slug: "security-tools",
    title: "Best Open-Source Security Tools",
    blurb:
      "vulnerability scanners, secret detection and security automation",
    categoryIds: ["security"],
    keywords: [],
  },
  {
    slug: "web-frameworks",
    title: "Best Web Frameworks",
    blurb: "frontend and full-stack frameworks powering the modern web",
    categoryIds: ["web-frameworks"],
    keywords: [],
  },
  {
    slug: "rust-projects",
    title: "Best Rust Projects",
    blurb: "Rust-native libraries, frameworks and tools built for performance",
    categoryIds: ["rust-ecosystem"],
    keywords: [],
  },
  {
    slug: "self-hosted-ai",
    title: "Best Self-Hosted AI Tools",
    blurb:
      "privacy-first, self-hostable AI apps and infrastructure you fully control",
    categoryIds: ["ai-agents", "ai-ml", "local-llm", "devtools", "infrastructure"],
    keywords: ["self-host", "self host", "local", "on-device", "on device", "private", "offline"],
  },
];

export const BEST_TOPIC_SLUGS: string[] = BEST_TOPICS.map((t) => t.slug);

export function getBestTopic(slug: string): BestTopic | null {
  return BEST_TOPICS.find((t) => t.slug === slug) ?? null;
}

function matchesKeywords(repo: Repo, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const hay = `${repo.name} ${repo.fullName} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
  return keywords.some((k) => hay.includes(k));
}

/**
 * Select + rank repos for a topic. Momentum-sorted with a deterministic
 * fullName tiebreaker (the same non-determinism guard the registry needs).
 * Caller must have awaited the trending/registry refresh hooks first.
 */
export function selectTopicRepos(topic: BestTopic, limit = 15): Repo[] {
  const picked = getDerivedRepos().filter(
    (r) =>
      (topic.categoryIds.length === 0 || topic.categoryIds.includes(r.categoryId)) &&
      matchesKeywords(r, topic.keywords),
  );
  picked.sort((a, b) => {
    if (b.momentumScore !== a.momentumScore) return b.momentumScore - a.momentumScore;
    if ((b.starsDelta24h ?? 0) !== (a.starsDelta24h ?? 0))
      return (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0);
    if ((b.stars ?? 0) !== (a.stars ?? 0)) return (b.stars ?? 0) - (a.stars ?? 0);
    return a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase());
  });
  return picked.slice(0, limit);
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildBestIntro(topic: BestTopic, repos: Repo[]): string {
  const count =
    repos.length > 0
      ? ` ${repos.length} ${repos.length === 1 ? "project" : "projects"} qualified as of ${todayLabel()}.`
      : "";
  // Prefer the LLM-written expert overview (worker `editorial-best` slug) when
  // present — evergreen definitional prose answer-engines cite — then append
  // the live qualifying count. Caller must have awaited
  // refreshEditorialBestFromStore(). Falls back to the deterministic intro when
  // no overview is stored (no Redis locally, or worker hasn't run yet).
  const editorial = getEditorialBest(topic.slug);
  if (editorial?.overview) {
    return `${editorial.overview}${count}`;
  }
  const lead = `This is our ranked list of the best ${topic.blurb}.`;
  const method = ` Every project is open source and ranked by TrendingRepo's cross-source momentum score — GitHub star velocity weighted with live mentions on Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to — not by raw star count, so newer breakouts surface alongside the established leaders.`;
  return `${lead}${method}${count}`;
}

export function buildBestFaq(topic: BestTopic, repos: Repo[]): FaqEntry[] {
  const top = repos.slice(0, 5).map((r) => r.fullName);
  const list =
    top.length === 0
      ? ""
      : top.length === 1
        ? top[0]
        : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  const out: FaqEntry[] = [];

  out.push({
    q: `What are the best ${topic.title.replace(/^Best /, "").toLowerCase()}?`,
    a:
      list.length > 0
        ? `As of ${todayLabel()}, the top-ranked are ${list} — ordered by TrendingRepo's cross-source momentum score across GitHub, Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to.`
        : `TrendingRepo ranks these by a cross-source momentum score across GitHub, Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to.`,
  });
  out.push({
    q: `How does TrendingRepo choose this list?`,
    a: `We filter our tracked open-source index to ${topic.blurb}, then rank by a 0-100 momentum score combining 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness and release cadence, with cross-source mention signals and anti-spam dampening on top.`,
  });
  out.push({
    q: `Are these all free and open source?`,
    a: `Yes. Every project listed is an open-source repository on GitHub with a public license — TrendingRepo only ranks open-source code.`,
  });
  out.push({
    q: `How often is this list updated?`,
    a: `Roughly every 20 minutes. Collectors re-scan the signal sources and recompute the rankings, so the list reflects momentum within the last hour.`,
  });
  return out;
}
