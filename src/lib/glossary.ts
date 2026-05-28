// Glossary — definitional "What is X?" answer-surfaces at /glossary/[term].
//
// Pure AI-Overview / featured-snippet bait: a crisp original definition plus
// the live trending repos for the term (so the page is grounded in our data,
// not just prose). Each term links into the relevant category/best surfaces.
// Curated registry — not auto-generated — so every definition is accurate.

import { getDerivedRepos } from "@/lib/derived-repos";
import type { FaqEntry } from "@/lib/seo/structured-data";
import type { Repo } from "@/lib/types";

export interface GlossaryTerm {
  slug: string;
  /** Canonical display term, e.g. "AI agent". */
  term: string;
  /** One-sentence answer (the snippet/DefinedTerm description). */
  short: string;
  /** Full definition paragraphs (original prose). */
  body: string[];
  /** Surface to send readers to for the live ranked list. */
  related: { label: string; href: string };
  /** Repo selection for the "trending {term}" block. */
  categoryIds: string[];
  keywords: string[];
  /** Extra Q&A beyond the definition. */
  faq?: FaqEntry[];
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: "ai-agent",
    term: "AI agent",
    short:
      "An AI agent is a system that uses a large language model to plan and take actions toward a goal — calling tools, reading results, and iterating with little or no human input.",
    body: [
      "An AI agent wraps a large language model in a loop: it reasons about a goal, chooses an action (often calling an external tool or API), observes the result, and repeats until the task is done. The defining trait versus a plain chatbot is autonomy — the model decides the next step rather than just answering one prompt.",
      "Open-source agent frameworks provide the scaffolding for this loop: tool/function calling, memory, planning, and multi-agent orchestration. They range from coding agents that edit and run your repository to general task agents that browse the web or operate software.",
    ],
    related: { label: "Trending AI agents", href: "/categories/ai-agents" },
    categoryIds: ["ai-agents"],
    keywords: [],
    faq: [
      {
        q: "What is the difference between an AI agent and a chatbot?",
        a: "A chatbot responds to a single prompt; an AI agent runs an autonomous loop — it plans, calls tools, observes results, and keeps going until the goal is met or it gives up.",
      },
    ],
  },
  {
    slug: "mcp",
    term: "Model Context Protocol (MCP)",
    short:
      "MCP is an open standard that lets AI assistants connect to external tools, data, and services through one consistent interface, so any MCP client can use any MCP server.",
    body: [
      "The Model Context Protocol (MCP) defines a common contract between AI clients (Claude, IDE agents, custom apps) and servers that expose capabilities — a database, a file system, an API, a browser. Instead of bespoke glue per integration, you publish an MCP server once and the whole ecosystem can use it.",
      "MCP exploded across 2025-26 because it turns 'wire this one model to this one tool' into a reusable building block. The winning servers are the ones that stay compatible as the young spec evolves and solve an integration developers were previously hand-rolling.",
    ],
    related: { label: "Trending MCP servers", href: "/categories/mcp" },
    categoryIds: ["mcp"],
    keywords: [],
  },
  {
    slug: "rag",
    term: "RAG (Retrieval-Augmented Generation)",
    short:
      "RAG is a technique that retrieves relevant documents from a knowledge base and feeds them to a language model as context, so its answers are grounded in your data instead of only its training.",
    body: [
      "Retrieval-Augmented Generation (RAG) pairs a retriever with a generator. At query time the retriever finds the most relevant chunks — usually via a vector database and embeddings — and the language model answers using those chunks as context. This grounds responses in current, private, or domain-specific data the model never saw in training, and lets you cite sources.",
      "A typical open-source RAG stack combines an embedding model, a vector store, a chunking/ingestion pipeline, and an orchestration layer. RAG is the most common way teams add company knowledge to an LLM without fine-tuning.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml", "databases"],
    keywords: ["rag", "retrieval", "embedding", "vector"],
  },
  {
    slug: "vector-database",
    term: "vector database",
    short:
      "A vector database stores embeddings — numeric representations of text, images, or code — and finds the most similar ones fast, powering semantic search and RAG.",
    body: [
      "A vector database indexes high-dimensional embedding vectors and answers nearest-neighbour queries: given a query vector, return the most semantically similar stored items. This is the retrieval engine behind semantic search, recommendations, and RAG pipelines.",
      "Open-source options range from purpose-built vector stores to vector extensions bolted onto existing databases. The trade-offs are recall vs. latency, index type (HNSW, IVF), and how well it scales with your corpus.",
    ],
    related: { label: "Best vector databases", href: "/best/vector-databases" },
    categoryIds: ["databases"],
    keywords: ["vector", "embedding", "semantic", "ann", "similarity"],
  },
  {
    slug: "llm",
    term: "large language model (LLM)",
    short:
      "A large language model is a neural network trained on massive text corpora to predict the next token, giving it the ability to generate and understand human language.",
    body: [
      "A large language model (LLM) is a transformer-based neural network trained to predict the next token over enormous text datasets. That simple objective, at scale, yields emergent abilities: writing, reasoning, translation, coding, and tool use. Models are characterised by parameter count, context window, and training data.",
      "Open-source LLMs and the tooling around them — inference servers, quantization, fine-tuning frameworks — let teams run capable models on their own hardware instead of only through a hosted API.",
    ],
    related: { label: "Best open-source LLMs", href: "/best/open-source-llms" },
    categoryIds: ["ai-ml", "local-llm"],
    keywords: ["llm", "language model", "transformer", "inference", "model"],
  },
  {
    slug: "local-llm",
    term: "local LLM",
    short:
      "A local LLM is a language model that runs on your own machine or servers instead of a hosted API — for privacy, offline use, and cost control.",
    body: [
      "A local LLM runs inference on hardware you control. With quantization and efficient runtimes, capable open models now run on a laptop or a single GPU. Teams choose local for data privacy, offline operation, predictable cost, and no per-token API fees.",
      "The open-source local-LLM ecosystem covers inference engines, model runners with one-command setup, and UIs — the layer that turns raw model weights into something you can actually chat with or build on.",
    ],
    related: { label: "Best local LLM tools", href: "/best/local-llm-tools" },
    categoryIds: ["local-llm"],
    keywords: [],
  },
  {
    slug: "ai-coding-assistant",
    term: "AI coding assistant",
    short:
      "An AI coding assistant uses an LLM to help you write, edit, and debug code — from inline autocomplete to autonomous agents that implement whole tasks across a repository.",
    body: [
      "AI coding assistants span a spectrum: inline completion in your editor, chat-based pair programming, and autonomous coding agents that read your repo, plan a change, edit multiple files, run tests, and iterate. The autonomous end overlaps heavily with AI agents.",
      "Open-source options let you bring your own model (including local LLMs), keep code on your own infrastructure, and customise the workflow — increasingly important for teams with privacy or compliance constraints.",
    ],
    related: { label: "Best AI coding assistants", href: "/best/ai-coding-assistants" },
    categoryIds: ["ai-agents", "devtools"],
    keywords: ["coding agent", "coding assistant", "copilot", "pair program", "aider", "cline", "ai code"],
  },
  {
    slug: "browser-automation",
    term: "browser automation",
    short:
      "Browser automation drives a real web browser programmatically — clicking, typing, and navigating — for testing, scraping, and increasingly AI agents that operate the web.",
    body: [
      "Browser automation controls a headless or headed browser through code or an agent. Classic uses are end-to-end testing and web scraping; the fast-growing use is AI 'web operator' agents that navigate sites to complete tasks a human would do in a browser.",
      "Open-source stacks provide the driver layer (controlling the browser) and, increasingly, an agent layer that lets an LLM decide what to click next from a screenshot or the DOM.",
    ],
    related: { label: "Best browser automation tools", href: "/best/browser-automation-tools" },
    categoryIds: ["browser-automation"],
    keywords: [],
  },
];

export const GLOSSARY_SLUGS: string[] = GLOSSARY.map((t) => t.slug);

export function getGlossaryTerm(slug: string): GlossaryTerm | null {
  return GLOSSARY.find((t) => t.slug === slug) ?? null;
}

function matches(repo: Repo, term: GlossaryTerm): boolean {
  const catOk = term.categoryIds.length === 0 || term.categoryIds.includes(repo.categoryId);
  if (!catOk) return false;
  if (term.keywords.length === 0) return true;
  const hay = `${repo.name} ${repo.fullName} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
  return term.keywords.some((k) => hay.includes(k));
}

/** Top trending repos illustrating the term. Caller awaits refresh hooks. */
export function getGlossaryRepos(term: GlossaryTerm, limit = 8): Repo[] {
  const picked = getDerivedRepos().filter((r) => matches(r, term));
  picked.sort((a, b) => {
    if (b.momentumScore !== a.momentumScore) return b.momentumScore - a.momentumScore;
    return a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase());
  });
  return picked.slice(0, limit);
}

export function buildGlossaryFaq(term: GlossaryTerm): FaqEntry[] {
  const out: FaqEntry[] = [{ q: `What is ${term.term}?`, a: `${term.short} ${term.body[0] ?? ""}`.trim() }];
  if (term.faq) out.push(...term.faq);
  return out;
}
