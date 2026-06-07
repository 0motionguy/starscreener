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
  /**
   * Hand-written 250-400 word editorial intro shown above the ranked list.
   * Takes precedence over the LLM-written `editorial-best` overview from
   * the worker. Falls back to the deterministic intro if empty. Authored
   * to give Google a unique, opinionated lead that clears the
   * thin-content threshold for "Discovered, not indexed" verdicts.
   */
  intro?: string;
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
    intro:
      "An AI agent is software that decides what to do next. It reads, plans, calls tools, observes the result, and loops. That's it. Most of the chaos in this category comes from how many ways people have found to dress that loop up. The shortlist below mostly looks like one of three things: a single-agent harness wrapping a model with file system + shell + browser tools (Aider, Claude Code, Codex and the long tail of forks), an orchestration framework where a planner dispatches specialist agents (LangGraph, CrewAI, AutoGen successors), or a runtime — sandbox, memory layer, MCP toolbox — that the first two run inside. My take: the harnesses are winning on the engineering side and the orchestration frameworks are winning on the demo side, and most production systems quietly land on a single agent with great tools instead of a swarm. The ranking dampens the agent space's worst habit — fork-and-rename copies of last month's breakout grabbing stars without anyone shipping them — by counting mentions across Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to alongside star velocity. Score one is a repo people are wiring into stacks. Score zero is a README. When you're choosing what to build on, read the last twenty commits and the open issues, not the star count. The questions that matter: is the loop legible, are tool calls pluggable, who controls memory, and can you debug a failure without staring at model weights? Everything here is open source under a permissive licence.",
    categoryIds: ["ai-agents"],
    keywords: [],
  },
  {
    slug: "ai-coding-assistants",
    title: "Best AI Coding Assistants & Copilots",
    blurb:
      "open-source AI pair programmers, autonomous coding agents and IDE copilots",
    intro:
      "Two different products live in this category and people keep confusing them. The IDE copilot is the descendant of GitHub Copilot — tab-completion, inline edits, a chat panel, all living inside your editor. You judge it on latency and how often the next line is what you wanted. The coding agent is the descendant of Aider — a CLI you point at a repo, give a goal, and watch it read, edit, test, retry. You judge it on whether it can land a non-trivial PR without supervision, and on whether it stops cleanly when it can't. Both ship as open source now, and Claude Code, Codex CLI, Aider, Cline, and the swarm of forks around them define the agent half. The copilot half has more incumbents and slower release cadence. Both halves rank here together because most teams adopt one of each. The cross-source signal matters more for this category than most — adoption in coding tooling spreads through engineers talking on Hacker News and X about real workflows, not press releases. A repo with 4k stars and a steady mention curve usually beats a repo with 40k stars and a flat one. Two heuristics for picking from this list: weight battle-tested over recent, and weight scoped over ambitious. The projects that don't survive their second year are the ones whose roadmap promised everything.",
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
    intro:
      "MCP is the most useful piece of plumbing the AI ecosystem shipped this year. An MCP server exposes tools, resources, and prompts behind a single contract; any MCP client — Claude Desktop, Cursor, your own agent — can call them with no bespoke glue. Once the contract stabilised, the floodgates opened. The open-source community is now shipping MCP servers faster than vendors can publish official ones. The repos here fall into four shapes that often overlap: connectors that bridge MCP into a single service (databases, design tools, browsers), registries and meta-servers that proxy many backends through one endpoint, horizontal toolboxes bundling file system + shell + search + HTTP for general agents, and protocol-aware runtimes that re-expose themselves as MCP servers so other agents can call them. The category attracts a high ratio of demo-grade work — repos that ship a flashy README, hit Hacker News, and never get a second commit. The ranking knocks those down by counting sustained mention activity, not first-day stars. The questions to ask about any MCP server you're evaluating: how is auth scoped (most default to too-broad), how is state modelled across calls, what happens when the upstream service is down, and are tool descriptions sharp enough that the model picks the right one without hand-holding. Tool description quality is the single biggest predictor I've seen of whether an MCP server is pleasant to use in practice.",
    categoryIds: ["mcp"],
    keywords: [],
  },
  {
    slug: "local-llm-tools",
    title: "Best Local LLM Tools",
    blurb:
      "on-device inference engines and self-hosted runtimes for running models locally",
    intro:
      "Two years ago, running a 7B model on a laptop meant compiling llama.cpp, hand-quantising weights, and tolerating single-digit tokens per second on CPU. Today it's a one-line install with GPU acceleration, structured output, function calling, and an OpenAI-compatible HTTP server thrown in. The gap closed shockingly fast and most builders haven't fully internalised that local is now a real product surface. The repos here are the engines and front-ends that did the work. Three layers stack: the inference engines (llama.cpp, vLLM, MLC, MLX) squeezing every flop out of consumer hardware; the model managers (Ollama, LM Studio, GPT4All) putting a friendly install + chat + API on top; and the integration layers (LangChain backends, MCP servers, Open WebUI) letting existing tooling treat a local model the same as a hosted one. When you're picking, the question isn't 'what's fastest' but 'what does my stack need from the runtime' — OpenAI-compatible endpoint, structured output, embedding model alongside chat, Apple Silicon support, raw throughput. The ranking weighs mentions on Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to alongside star velocity so a breakout from last week surfaces alongside the established leaders rather than getting buried under historical totals.",
    categoryIds: ["local-llm"],
    keywords: [],
  },
  {
    slug: "open-source-llms",
    title: "Best Open-Source LLMs & Model Projects",
    blurb:
      "open language models, inference servers and training frameworks",
    intro:
      "This list is the foundation layer for almost every other one on the site. It mixes model families (Llama, Mistral, Qwen, DeepSeek, Gemma and their fine-tunes), inference servers (vLLM, TGI, SGLang) that turn weights into production endpoints, training frameworks (TRL, Unsloth, Axolotl) that let teams adapt base models without a research lab, and the tokenizer / data / evaluation tooling around all of it. The line between 'model project' and 'inference engine' is artificial — teams adopt them as a stack, so they rank as a stack. The momentum pattern here is unusual. A frontier weight drop spikes every signal source in the same 48 hours, then settles fast. Quieter projects with steady release cadence and active fine-tuning communities hold position longer than the spike curve suggests. The score is built to surface both. Three things to check before betting a roadmap on a model: the licence on the weights versus the licence on the source code (they often differ — a permissive repo licence doesn't mean permissive weights), eval scores against your actual use case rather than the published leaderboard (the leaderboard lies about what you'll see), and inference cost on your target hardware. Open eval suites have gotten better but they're still upstream of your own tests, not a substitute.",
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
    intro:
      "A vector database stores embeddings and answers similarity queries — k-nearest-neighbour over high-dimensional floats — fast enough to use inside a request handler. Five years ago this was a research problem. Now it's a checkbox any AI product ships with. The open-source landscape splits three ways and you should pick across them by the shape of your existing data, not by stars. Dedicated vector engines (Qdrant, Milvus, Weaviate, Chroma, Vespa) treat vector search as the primary workload and stack hybrid scoring, filtering, sharding, and replication on top. Search engines with strong vector support (Meilisearch, Typesense, OpenSearch) added vectors after they were great at lexical search — the right shape if your real workload is hybrid. General-purpose databases (Postgres + pgvector, SQLite + vec extensions, DuckDB) bolted vector indexes into transactional engines, which wins when your vectors live next to relational data you'd otherwise be joining over the network. The pragmatic answer for most teams is the third option. Postgres + pgvector is boring and good. Move to a dedicated engine when the workload demands it. Things to verify before adopting any of them: how updates and deletes work (some engines are append-only with background compaction), how filtering interacts with the vector index (pre vs post filter changes the cost model by an order of magnitude), embedding model coupling, and whether the operational story matches what you can actually run.",
    categoryIds: ["databases"],
    keywords: ["vector", "embedding", "rag", "semantic", "ann", "similarity"],
  },
  {
    slug: "browser-automation-tools",
    title: "Best Browser Automation Tools",
    blurb:
      "browser-use stacks, web operators and automation agents for testing and scraping",
    intro:
      "Browser automation used to mean Playwright, Puppeteer, or Selenium driving a real browser through a programmatic API for testing or scraping. In 2025 the category absorbed a second, very different population — agentic stacks that wrap a model around those same primitives and let it decide what to click, type, and read. The two communities don't always realise they're sharing a category. A QA engineer wants determinism, headless speed, and a stable selector strategy. An AI builder wants a loop that finishes a multi-step task without supervision, even when the page changes. Both ship here. Playwright and Puppeteer still dominate the head of the distribution because every AI browser project depends on them. The newer entrants — browser-use, Stagehand, web-operator harnesses — pair Playwright with DOM-graph reasoning, retries, and a model in the steering loop. Honest take on the agentic half: it's not as production-ready as the demos suggest. Anti-bot defences, captchas, and shifting DOM structure break runs that worked yesterday. If you're picking a stack, the questions are: how deterministic is the automation under model steering or is every run a coin flip, how does the project handle captchas (or does it pretend they don't exist), and is the headless mode genuinely production-quality or only debug-good.",
    categoryIds: ["browser-automation"],
    keywords: [],
  },
  {
    slug: "developer-tools",
    title: "Best Open-Source Developer Tools",
    blurb: "CLIs, linters, formatters, bundlers and DX utilities",
    intro:
      "The widest list on the site. Anything that makes writing software faster, cleaner, or less painful counts — language toolchains, linters, formatters, type checkers, bundlers, package managers, test runners, build systems, polyglot toolboxes, and the long tail of small sharp CLIs people add to their dotfiles. The category is shaped by three live currents. The Rust rewrite wave hasn't slowed. Every month another aging JavaScript or Python tool gets a Rust rewrite that's 10-50x faster, and the well-built ones earn lasting adoption inside a year. The polyglot toolchain wave (Biome, Bun, Deno) keeps consolidating multiple tools into single binaries, which changes how teams pick their stack. And the small-CLI tail keeps producing breakouts — git wrappers, file searchers, terminal utilities — that hit Hacker News' front page and end up in everyone's `.bashrc`. The ranking gives the small projects a fair shot at the top: a tool with 800 stars and 4,000 daily downloads outranks a tool with 80,000 stars and a flat trend. If you're scanning for a new build or lint tool to adopt, the things that actually matter: how aggressively the project breaks compatibility (some Rust rewrites move fast), what migration from the incumbent looks like, whether the project has a clear opinion or just configurability for its own sake, and how the maintainers communicate releases.",
    categoryIds: ["devtools"],
    keywords: [],
  },
  {
    slug: "security-tools",
    title: "Best Open-Source Security Tools",
    blurb:
      "vulnerability scanners, secret detection and security automation",
    intro:
      "Security tooling has split into four buckets that teams adopt across, not from. Static analysis (semgrep, CodeQL, Bearer and language-specific linters) inspects code at rest. Software composition analysis (Trivy, Grype, OSV-Scanner, Syft) tracks dependency CVEs and licence drift. Secret scanners (Gitleaks, TruffleHog, detect-secrets) catch credentials in commits before they hit history. And the security-automation layer — SBOM builders, policy engines, IaC scanners, the red-team toolbox — orchestrates the rest into CI pipelines or runtime guardrails. Signal patterns are weird in this category. A critical CVE drop drives huge traffic to whichever scanner detects it first, then settles. Project usage routinely outpaces star counts because enterprises adopt scanners without publicly contributing love. And the long tail of pen-testing and red-team tooling produces continuous low-key activity. The ranking smooths over the spikes by counting sustained mention activity alongside stars. The unflashy security tools are usually the best ones — the projects with a decade of incremental release notes outperform the viral newcomer over any horizon longer than a quarter. When evaluating, the things that actually matter: signal-to-noise ratio (every scanner produces false positives — read the issue tracker to see how the project triages them), the provenance of the security tool itself (a security tool with weak provenance is worse than no tool), and integration shape: CI plugin, pre-commit hook, runtime daemon, or standalone CLI.",
    categoryIds: ["security"],
    keywords: [],
  },
  {
    slug: "web-frameworks",
    title: "Best Web Frameworks",
    blurb: "frontend and full-stack frameworks powering the modern web",
    intro:
      "The frontend / backend split has collapsed for full-stack work. Next.js, SvelteKit, Nuxt, Astro, SolidStart and Remix all ship server-side rendering, server components, edge functions, and built-in data layers — they're meta-frameworks now, not just frontends. The meta-router / meta-loader / meta-everything stack that used to require ten separate libraries got consolidated by Astro, Vike, TanStack Start and friends. And the Rust + WASM corner (Leptos, Dioxus, Yew) keeps producing genuinely competitive frameworks that ship faster wire payloads than their JS counterparts. The list mixes all of them with the long tail of backend HTTP frameworks across Go, Rust, Python, Ruby, Elixir and TypeScript because teams typically choose a frontend, a backend, and a deploy target as one decision. Historical-star advantage matters less than it looks. A 200k-star framework with a flat release cadence ranks below a 15k-star one currently shipping a major release because the cross-source score weights live momentum. Reading the list, the questions that decide adoption: streaming and edge-function support, the data-loading story for your stack, how type safety travels across the network boundary (tRPC-shape vs server-actions-shape vs traditional REST), and how the framework's deployment story matches what you can actually run.",
    categoryIds: ["web-frameworks"],
    keywords: [],
  },
  {
    slug: "rust-projects",
    title: "Best Rust Projects",
    blurb: "Rust-native libraries, frameworks and tools built for performance",
    intro:
      "Rust is the obvious answer when a project needs the speed of C with safety guarantees the rest of the ecosystem doesn't offer. The Rust list here cuts across categories rather than reproducing the systems-library cliché — web frameworks (Axum, Actix, Loco) rank alongside the developer tools coming out of the Rust rewrite wave, alongside AI infrastructure (Candle, fast tokenizers, vector engines), embedded and OS-level work, and the language and toolchain itself. Two patterns shape what shows up. The Rust rewrite of aging JS / Python / Go tooling is steady and not slowing. AI tooling in Rust is quietly consistent because operators want single binaries running hot loops without GIL or garbage collection, and that audience pays for performance. Beyond that, classic systems projects (package managers, build systems, container runtimes, observability agents) keep migrating from C/C++ as the safety story compounds. The Rust community is also unusually loud across Hacker News, Reddit (especially r/rust) and Bluesky relative to its raw GitHub footprint, so the cross-source score is a particularly good fit here — stale stars get dampened, live conversation surfaces. When picking, the things that actually matter: how the project handles API surface area as it grows (Rust rewards tight crates with crisp boundaries), whether maintainers ship breaking changes on a predictable cadence, and how the cargo + clippy + miri tooling is integrated into the project's CI.",
    categoryIds: ["rust-ecosystem"],
    keywords: [],
  },
  {
    slug: "self-hosted-ai",
    title: "Best Self-Hosted AI Tools",
    blurb:
      "privacy-first, self-hostable AI apps and infrastructure you fully control",
    intro:
      "Self-hosting AI used to mean compiling llama.cpp on a server and exposing a Python notebook through ngrok. It now means deploying a small handful of well-built open-source pieces — inference runtime, chat UI, embedding store, MCP tooling, observability — all running inside infrastructure you control. The gap between hosted-frontier and self-hosted-open-weights closed enough in the last 18 months that small and medium teams can run a real AI product without sending tokens to a third party. That's a quietly big shift and most people haven't internalised it. The list spans the full stack: model runtimes (Ollama, llama.cpp, vLLM, LM Studio), chat interfaces (Open WebUI, LibreChat, AnythingLLM), agent runtimes deployable as services, vector databases for RAG, and the integration glue (MCP servers, OpenAI-compatible proxies) that lets your existing app code treat a self-hosted model the same as a hosted one. The cross-source score is especially well-suited to this category because self-hosting conversation clusters on Reddit (r/LocalLLaMA, r/selfhosted) and Hacker News far more than the broader AI buzz — community traction there is the best signal you'll get. If you're building a self-hosted stack, the practical questions are: GPU + CPU + Apple Silicon support across the runtime, whether the chat UI handles multi-user auth and conversation persistence properly, how RAG is wired (in-process embedding vs external vector DB), and how observability works. Most self-hosted setups skip the last one and regret it.",
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
 * Find every /best/<topic> page whose filter the repo qualifies for. Used by
 * the repo detail page to render reverse back-links — the missing internal-
 * link signal that GSC's URL-inspection audit flagged as the reason /best/*
 * pages stay in "Discovered, currently not indexed" purgatory.
 *
 * Qualification is a CATEGORY MATCH + (no keyword filter, OR keyword match).
 * It does NOT confirm the repo would appear in the topic's top-15 ranked
 * cut — that's intentional. The qualification semantic ("this repo is the
 * kind of thing that ranks in this list") is what gives Google a meaningful
 * topical link signal; "is currently rank 1-15" would be too restrictive
 * and the link would churn on every collector cycle.
 */
export function getMatchingBestTopics(repo: Repo): BestTopic[] {
  return BEST_TOPICS.filter(
    (t) =>
      (t.categoryIds.length === 0 || t.categoryIds.includes(repo.categoryId)) &&
      matchesKeywords(repo, t.keywords),
  );
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
  // Priority 1: hand-written intro on the topic. Complete editorial preamble
  // — no mechanical append, since the count appears in the hero meta block
  // anyway and tacking text onto a curated paragraph reads as machine-padded.
  if (topic.intro?.trim()) {
    return topic.intro.trim();
  }

  const count =
    repos.length > 0
      ? ` ${repos.length} ${repos.length === 1 ? "project" : "projects"} qualified as of ${todayLabel()}.`
      : "";
  // Priority 2: LLM-written expert overview (worker `editorial-best` slug),
  // appended with the live qualifying count. Caller must have awaited
  // refreshEditorialBestFromStore().
  const editorial = getEditorialBest(topic.slug);
  if (editorial?.overview) {
    return `${editorial.overview}${count}`;
  }
  // Priority 3: deterministic floor — always available so a page never ships
  // empty even if Redis is unreachable.
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
