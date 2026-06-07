// Category answer-surface helpers — the data + deterministic copy behind the
// /categories/[slug] hub pages.
//
// The category taxonomy (15 buckets) lives in @/lib/constants CATEGORIES.
// Repos carry a `categoryId` from the classification pipeline; we filter the
// derived repo set by it and rank by momentum. The prose + FAQ here are
// DETERMINISTIC and grounded in real data (counts, top movers, methodology)
// — honest descriptive page copy, NOT attributed analysis. Richer
// LLM-written category overviews (Workstream B / editorial-writer) layer on
// top later via a separate store read; this module is the always-available
// floor so a page never ships empty.

import { CATEGORIES } from "@/lib/constants";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getEditorialCategories } from "@/lib/editorial-categories";
import type { FaqEntry } from "@/lib/seo/structured-data";
import type { Repo } from "@/lib/types";

export type CategoryMeta = (typeof CATEGORIES)[number];

export const CATEGORY_SLUGS: string[] = CATEGORIES.map((c) => c.id);

export function getCategoryMeta(slug: string): CategoryMeta | null {
  return CATEGORIES.find((c) => c.id === slug) ?? null;
}

/**
 * Hand-written 250-400 word editorial intros per category slug. Takes
 * priority over the LLM-written `editorial-categories` worker output and
 * over the deterministic fallback in buildCategoryIntro(). Written to give
 * each category page unique, opinionated lead-text that clears Google's
 * "Discovered, not indexed" threshold on the templated routes.
 *
 * Voice contract: monitoring/wide-view tone (compare with the curated /best
 * intros in best-topics.ts which are decision-intent). Each entry frames
 * the category, names the live dynamics, and sets expectations for the
 * leaderboard below.
 */
export const CATEGORY_INTROS: Record<string, string> = {
  "ai-agents":
    "The widest cut of the agent ecosystem on the site. The /best/ai-agents page is the curated top-N; this leaderboard is the full feed — single-agent harnesses, orchestration frameworks, runtimes, sandboxes, memory layers, MCP-connected toolboxes. Agent projects ship in noisy bursts. One Hacker News appearance can move a repo a hundred places. Fork-and-rename churn is the highest of any category here — last month's breakout reappears under five new names within the week. The ranking weights cross-source mention activity (Hacker News, Reddit, X, Bluesky, Product Hunt, Dev.to) alongside GitHub stars so the projects near the top are the ones builders are actually shipping into stacks, not the ones with the catchiest README. Categories classify automatically from GitHub topics, name, description, and owner. Misclassifications happen and self-correct over the next few collector cycles. When scanning the list, the most useful filter is fresh commit activity combined with sustained mention momentum — that's how you tell adoption from a single-day spike.",
  mcp:
    "MCP — the Model Context Protocol — went from spec to ecosystem in under a year. Every API, database, IDE, and SaaS now wants an MCP server, and the open-source community is shipping them faster than vendors can keep up. This leaderboard is the wide feed; /best/mcp-servers is the curated cut. The repos here split four ways: single-service connectors (databases, design tools, browsers), registries and meta-servers proxying many backends through one endpoint, horizontal toolboxes bundling file system + shell + search + HTTP for general agents, and protocol-aware runtimes that re-expose themselves as MCP servers so other agents can call them. The category attracts a high ratio of demo-grade work — flashy README, viral hit, no second commit. The score knocks those down by counting sustained mentions, not first-day stars. Reading the leaderboard, recency matters more than usual: the protocol is still evolving and yesterday's reference implementation gets superseded routinely.",
  devtools:
    "The widest category on the site. Anything that makes writing software faster, cleaner, or less painful counts — language toolchains, linters, formatters, type checkers, bundlers, package managers, test runners, build systems, polyglot toolboxes, terminal utilities, and the long tail of small CLIs people drop into dotfiles. The Rust rewrite wave hasn't slowed. Every month another aging JavaScript or Python tool gets a Rust rewrite that's 10-50x faster, and the well-built ones earn lasting adoption inside a year. The polyglot toolchain wave (Biome, Bun, Deno) keeps consolidating multiple tools into single binaries, which changes how teams pick their stack. The small-CLI tail keeps producing breakouts that hit Hacker News' front page and end up in everyone's shell config. The ranking gives those small projects a fair shot at the top — a tool with 800 stars and 4,000 daily downloads outranks one with 80,000 stars and a flat trend. The /best/developer-tools page is the curated cut; this is the full feed.",
  "browser-automation":
    "Two communities share this category and they often don't realise it. QA engineers want determinism, headless speed, and a stable selector strategy — Playwright, Puppeteer, Selenium and forks. AI builders want a model-in-the-loop stack that can finish a multi-step task without supervision when the page changes — browser-use, Stagehand, web-operator harnesses. The first group is mature; the second is interesting. Playwright and Puppeteer still dominate the head of the leaderboard because every AI browser project depends on them. The newer entrants pair those primitives with DOM-graph reasoning, retries, and a model in the steering loop. Honest read: the agentic half isn't as production-ready as the demos suggest. Anti-bot defences, captchas, and shifting DOM structure break runs that worked yesterday. The ranking weights cross-source mention activity alongside GitHub stars, so quietly-adopted libraries surface alongside the headline breakouts.",
  "local-llm":
    "Two years ago, running a 7B model on a laptop meant compiling llama.cpp, hand-quantising weights, and tolerating single-digit tokens per second on CPU. Today it's a one-line install with GPU acceleration, structured output, function calling, and an OpenAI-compatible HTTP server bundled in. The gap closed fast and most builders haven't fully internalised it. This leaderboard tracks the full stack: inference engines (llama.cpp, vLLM, MLC, MLX) squeezing every flop out of consumer hardware, model managers (Ollama, LM Studio, GPT4All) putting a friendly install + chat + API on top, and integration layers (LangChain backends, MCP servers, Open WebUI) letting existing app code treat a local model the same as a hosted one. Engine and manager often get adopted as a paired stack. The score weights live mentions across Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to alongside GitHub velocity, so an actively-discussed project climbs faster than one with a higher absolute star count but flat trend.",
  security:
    "Security tooling splits into four buckets that teams adopt across, not from. Static analysis (semgrep, CodeQL, Bearer, language-specific linters). Software composition analysis (Trivy, Grype, OSV-Scanner, Syft). Secret scanners (Gitleaks, TruffleHog, detect-secrets). And the security-automation layer — SBOM builders, policy engines, IaC linters, the red-team toolbox. Signal patterns are weird here. A critical CVE drop drives huge traffic to whichever scanner detects it first, then settles. Project usage routinely outpaces star counts because enterprises adopt scanners without publicly contributing love. The ranking smooths the spikes by counting sustained mentions alongside GitHub velocity. The unflashy security tools are usually the best ones — projects with a decade of incremental release notes outperform the viral newcomer over any horizon longer than a quarter. When evaluating, signal-to-noise ratio matters more than feature count: every scanner produces false positives, and how the project triages them tells you what working with it will feel like.",
  infrastructure:
    "What runs the software: orchestration, container runtimes, IaC tooling, observability stacks, service meshes, ingress controllers, and the platform-engineering kits that bind them together. Infrastructure moves on long-tail momentum — Kubernetes-adjacent tools have been ranking for years and continue to ship steady release notes that the broader 'AI tooling' news cycle doesn't drown out. The rise of platform-engineering teams created a hungry audience for opinionated, batteries-included stacks (Backstage, Cluster API, Crossplane), which the score picks up alongside the older incumbents. The most useful filter when reading the leaderboard is intent: is the project meant for a single team's stack, or is it a platform foundation for an entire org? The build-vs-adopt calculus is wildly different at those two scales, and the leaderboard mixes both because both are real.",
  "design-engineering":
    "Tracking the fastest-moving corner of the open-source frontend world. Design-to-code systems, UI generation tools (v0-likes, Stitch and friends), component libraries with strong design-system DNA (shadcn/ui and its sprawling ecosystem of variants), Figma-to-production kits, and the long tail of opinionated UI primitives that designers and engineers ship together. The gap between design tools and code is closing — every Figma plugin and design-system project now ships a code-generation story, and the community is leading the experimentation while the tool vendors catch up. AI's involvement in design is restructuring the tooling stack underneath; projects that thoughtfully blend AI generation with design-system constraints earn outsized momentum because builders actually want both, not either. Design-engineering breakouts tend to spread through dev-tooling Twitter and Product Hunt before they hit GitHub trending, which is exactly the signal the cross-source score is built to catch.",
  "ai-ml":
    "The foundation layer. Language models, training frameworks, inference servers, embedding pipelines, evaluation kits, fine-tuning toolchains, and the supporting infrastructure that makes those things deployable. The /best/open-source-llms page is the curated top-N; this is the wide cut, mixing model releases, library releases, and infrastructure releases on equal footing because teams adopt them as a stack. Frontier weight drops spike every signal source in the same 48 hours, then settle. Quieter projects — inference servers, evaluation suites, RAG toolkits — hold position more durably than the spike curve suggests. The score weights long-tail engagement so both shapes rank in their right relative position. When picking what to invest in, the things that matter: licence terms on weights versus source (the two often differ — a permissive repo licence doesn't mean permissive weights), evaluation methodology (open leaderboards lie about what you'll see in production), and the maintainer's track record on minor versions.",
  "web-frameworks":
    "The frontend / backend split has collapsed for full-stack work. Next.js, SvelteKit, Nuxt, Astro, SolidStart and Remix all ship server components, edge functions, streaming, and built-in data layers — they're meta-frameworks now, not just frontends. The meta-router / meta-loader / meta-everything stack that used to require ten separate libraries got consolidated by Astro, Vike, TanStack Start and friends. The Rust + WASM corner (Leptos, Dioxus, Yew) keeps producing genuinely competitive frameworks that ship faster wire payloads than their JS counterparts. The list mixes those with the long tail of backend HTTP frameworks across Go, Rust, Python, Ruby, Elixir and TypeScript because teams typically choose a frontend, a backend, and a deploy target as one decision. Historical-star advantage matters less than it looks — a 200k-star framework with a flat release cadence ranks below a 15k-star one shipping a major release, because the score weights live momentum.",
  databases:
    "The full ecosystem in one list: SQL engines, NoSQL stores, vector databases for AI search, time-series engines, columnar / analytical databases, and the embedded engines (SQLite, DuckDB) bridging in-process queries with distributed systems. The leaderboard mixes them because adoption mixes them — a Postgres + pgvector stack competes with a dedicated vector engine for the same use case, and the score lets both rank fairly. The community keeps consolidating around Postgres + extensions as the default for most workloads, with the long tail of specialised engines (vector, time-series, graph) earning slots by being meaningfully better at one thing. The AI-tooling wave drove heavy investment into vector engines and embedded databases — they rank alongside the historical SQL incumbents because that's where the live momentum is. Reading the list, the most useful filter is workload shape: transactional, analytical, vector-heavy, time-series-heavy, or general-purpose.",
  mobile:
    "Cross-platform frameworks (Flutter, React Native, Expo, Ionic), native tooling, desktop UI frameworks (Tauri, Electron, Wails), platform-specific SDK extensions, and the long tail of utilities making mobile and desktop builders' lives easier. Tauri vs Electron keeps churning — Tauri's Rust-based footprint advantage drives steady adoption while Electron's massive ecosystem keeps it dominant for established projects. Expo's tooling around React Native is the consolidator for how mobile teams ship; major Expo releases trigger activity across multiple signal sources at once. The desktop-app renaissance — local-first software, native productivity tools, self-hosted server UIs — keeps producing new entrants that combine Tauri or Electron with a thoughtful product story. Cross-source momentum is the right filter for this category specifically because mobile and desktop adoption flows through Product Hunt, Hacker News, and X far more than through GitHub trending. By the time a desktop app hits GitHub's top of the day, the discovery already happened elsewhere.",
  "data-analytics":
    "BI tools, data pipelines, visualisation libraries, dataframe engines, ETL / ELT orchestrators, lakehouse-adjacent infrastructure, and the supporting tooling builders use to move and reason about data at scale. Dataframe engines (Polars and the polars-adjacent ecosystem, DuckDB, Arrow-based libraries) have been ranking steadily for two years as the next-generation alternatives to Pandas; the migration is real and ongoing. Orchestration (Dagster, Prefect, the modern Airflow alternatives) shows steady release activity that signals real production adoption rather than viral spikes. The BI layer is in flux — open-source dashboards, embedded analytics frameworks, and lightweight visualisation kits keep landing on Hacker News and Product Hunt as teams look for alternatives to the closed-source incumbents. Data tooling adoption is conversation-driven — teams talk through their stack on Twitter and in Discord channels before they star repos — so the cross-source score picks up adoption signal earlier than GitHub-only metrics would.",
  "crypto-web3":
    "Blockchain clients, smart contract development tools, DeFi infrastructure, wallet SDKs, on-chain indexers, ZK tooling, and the broader open-source ecosystem around decentralised systems. EVM tooling — Foundry, Hardhat-adjacent kits, Solidity linters — produces steady release activity that keeps it near the top regardless of market cycles. Zero-knowledge tooling continues to ship at a high rate as ZK rollup adoption grows and the developer-experience story for ZK circuits matures. The long tail of chain-specific clients and SDKs (Solana, Sui, Aptos, Cosmos, Polkadot) produces continuous momentum that the score picks up alongside the EVM headlines. Reading the leaderboard, the things that matter: real production adoption (which is often invisible — many crypto tools are used at scale but not publicly starred), maintainer track record on shipping breaking changes responsibly, and security audit history. Table stakes for anything touching mainnet.",
  "rust-ecosystem":
    "Rust cuts across what the rest of the site classifies into separate buckets, so this category is the cross-section. Rust-native web frameworks (Axum, Actix, Loco) rank alongside the developer tools from the Rust rewrite wave, alongside AI infrastructure (Candle, fast tokenizers, vector engines), database engines, embedded and OS-level work, and the language and toolchain itself. The Rust community evaluates as a community — a Rust-native alternative to a JS or Python tool typically lands first on r/rust before it hits GitHub trending — and the cross-source score is built to catch exactly that. The Rust rewrite wave isn't slowing. AI tooling in Rust is quietly consistent because operators want single binaries running hot loops without GIL or garbage collection. Classic systems projects (package managers, build systems, container runtimes, observability agents) keep migrating from C/C++ as the safety story compounds. The community is also unusually loud across Hacker News, r/rust, and Bluesky relative to its raw GitHub footprint, so the score works particularly well here — stale stars get dampened, live conversation surfaces.",
};

/**
 * Repos in a category, ranked by momentum with a deterministic tiebreaker.
 * The fullName tiebreaker matters: many registry repos share a momentum
 * score, and sorting on score alone is non-deterministic (project rule —
 * see CLAUDE.md "deterministic sort tiebreaker"). Caller must have already
 * awaited refreshTrendingFromStore() / refreshRepoRegistryFromStore().
 */
export function getCategoryRepos(slug: string, limit = 60): Repo[] {
  const all = getDerivedRepos().filter((r) => r.categoryId === slug);
  all.sort((a, b) => {
    if (b.momentumScore !== a.momentumScore) return b.momentumScore - a.momentumScore;
    if ((b.starsDelta24h ?? 0) !== (a.starsDelta24h ?? 0))
      return (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0);
    if ((b.stars ?? 0) !== (a.stars ?? 0)) return (b.stars ?? 0) - (a.stars ?? 0);
    return a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase());
  });
  return all.slice(0, limit);
}

function formatList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Deterministic 2-3 sentence category overview, grounded in live counts +
 * top movers + the cross-source methodology. Genuinely differentiated copy
 * (not a bare list) so the page clears the thin-content bar on its own.
 */
export function buildCategoryIntro(meta: CategoryMeta, repos: Repo[]): string {
  // Priority 1: hand-written intro keyed by slug. Complete editorial preamble
  // — no mechanical appends, since the live count + top movers appear in the
  // hero meta block anyway and tacking that text onto curated prose reads as
  // machine-padded.
  const handWritten = CATEGORY_INTROS[meta.id];
  if (handWritten?.trim()) {
    return handWritten.trim();
  }

  const topNames = repos.slice(0, 3).map((r) => r.fullName);
  const count = repos.length;
  const tracking =
    count > 0
      ? ` We're tracking ${count} open-source ${count === 1 ? "project" : "projects"} in this category, ranked by a cross-source momentum score that blends GitHub star velocity with mentions on Hacker News, X, Bluesky, Product Hunt and Dev.to.`
      : ` We rank projects in this category by a cross-source momentum score that blends GitHub star velocity with mentions on Hacker News, X, Bluesky, Product Hunt and Dev.to.`;
  const top =
    topNames.length > 0
      ? ` The current top movers are ${formatList(topNames)}.`
      : "";
  // Priority 2: LLM-written expert overview (worker `editorial-categories`
  // slug), appended with the live tracking count + top movers. Caller must
  // have awaited refreshEditorialCategoriesFromStore().
  const editorial = getEditorialCategories(meta.id);
  if (editorial?.overview) {
    return `${editorial.overview}${tracking}${top}`;
  }
  // Priority 3: deterministic floor — always available so a page never ships
  // empty even if Redis is unreachable.
  const lead = `${meta.name} on TrendingRepo covers ${lowerFirst(meta.description)}.`;
  return `${lead}${tracking}${top}`;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Deterministic, truthful FAQ entries (plain-text answers). Used both for the
 * rendered accordion and the FAQPage JSON-LD, so the schema text exactly
 * matches the DOM (a requirement for valid FAQ rich results).
 */
export function buildCategoryFaq(meta: CategoryMeta, repos: Repo[]): FaqEntry[] {
  const topNames = repos.slice(0, 5).map((r) => r.fullName);
  const out: FaqEntry[] = [];

  out.push({
    q: `What are the best ${meta.name} projects right now?`,
    a:
      topNames.length > 0
        ? `As of ${todayLabel()}, the top-ranked open-source ${meta.name} projects on TrendingRepo are ${formatList(
            topNames,
          )} — ordered by a cross-source momentum score, not raw star count.`
        : `TrendingRepo ranks open-source ${meta.name} projects by a cross-source momentum score that blends GitHub star velocity with mentions across Hacker News, X, Bluesky, Product Hunt and Dev.to.`,
  });

  out.push({
    q: `What counts as ${meta.name}?`,
    a: `${meta.name} covers ${lowerFirst(meta.description)}. TrendingRepo classifies each repository automatically from its GitHub topics, name, description and owner.`,
  });

  out.push({
    q: `How does TrendingRepo rank ${meta.name} repos?`,
    a: `Each repo gets a 0-100 momentum score combining 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness and release cadence, with cross-source mention signals layered on top and anti-spam dampening applied.`,
  });

  if (repos.length > 0) {
    out.push({
      q: `How many ${meta.name} repos does TrendingRepo track?`,
      a: `${repos.length} ${repos.length === 1 ? "project is" : "projects are"} currently tracked in the ${meta.name} category, refreshed continuously as new repos break out across the signal sources.`,
    });
  }

  out.push({
    q: `How often is this list updated?`,
    a: `Roughly every 20 minutes. Automated collectors re-scan GitHub, Hacker News, X, Bluesky, Product Hunt, Dev.to and more, then recompute the rankings — so the leaderboard reflects momentum within the last hour.`,
  });

  return out;
}
