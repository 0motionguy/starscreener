// TrendingRepo — /llms-full.txt (long-form content for LLM ingestion)
//
// LLM-INGESTION GOAL.
//   Per the https://llmstxt.org spec, llms-full.txt is the long
//   companion to /llms.txt: a single plain-markdown document an
//   AI agent can fetch ONCE and drop straight into a model's
//   context window to learn what's hot in open source right now.
//   Markdown blocks, no boilerplate, no nav chrome — content only.
//
// WHY 100 REPOS.
//   Token budget. A typical block here is ~80-120 tokens, so 100
//   repos fits comfortably under ~12k tokens — well within every
//   modern context window (Claude/GPT/Gemini all start at 128k+),
//   and small enough that an agent can ingest it alongside the
//   user's prompt without crowding out the actual question. Going
//   to 1000+ would price out smaller models and is what the JSON
//   API is for anyway.
//
// METHODOLOGY + REFERENCE SECTIONS.
//   Closing the file with the same scoring methodology that drives
//   /docs lets a model cite the source-of-rank when answering "why
//   is X trending?" — without it, the file would be a list of
//   names with a magic number next to each. Keeping the
//   methodology terse and identical across surfaces means an agent
//   doesn't get conflicting explanations between /docs and here.
//
//   Reference sections (Methodology, Data freshness, Categories,
//   Definitions) sit BEFORE the per-repo dump so an agent that
//   token-budgets out partway through still picks up the
//   citable facts (scoring inputs, refresh cadence, taxonomy,
//   defined terms) before the long ranked list. The header still
//   carries the live snapshot timestamp; the dedicated Data
//   freshness block re-states it next to the rest of the
//   reference material so a model doesn't have to scroll back.
//
// Cache: 24h, same as /llms.txt. Underlying data refreshes every
// 3h via cron, but a 3h-stale ranked list is fine for an
// ingestion artifact (the agent will re-fetch when its own cache
// expires).

import { pipeline } from "@/lib/pipeline/pipeline";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getDeltas } from "@/lib/trending";
import { getLastFetchedAt } from "@/lib/trending";
import { absoluteUrl } from "@/lib/seo";
import { isSitemapEligible } from "@/lib/sitemap-xml";
import type { Repo } from "@/lib/types";

export const dynamic = "force-static";
export const revalidate = 86400;

const TOP_N = 100;

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
}

function fmtSignedDelta(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US")}`;
}

function renderRepoBlock(
  repo: Repo,
  rank: number,
  hasDeltaEntry: boolean,
): string {
  const lines: string[] = [];
  const score = Math.round(repo.momentumScore ?? 0);
  lines.push(`## ${rank}. ${repo.fullName} — momentum ${score}`);
  lines.push("");
  lines.push(`- URL: ${absoluteUrl(`/repo/${repo.owner}/${repo.name}`)}`);
  lines.push(`- GitHub: https://github.com/${repo.owner}/${repo.name}`);

  const desc = (repo.description ?? "").trim();
  if (desc) lines.push(`- Description: ${desc}`);

  // Stars + deltas. Deltas come from getDeltas() during derivation; the
  // *Missing flags tell us whether the value is real or a zero-shim. If
  // the deltas store has no entry for this repo at all, also skip — the
  // spec is explicit: don't fake numbers.
  const stars = repo.stars ?? 0;
  const d24Real = hasDeltaEntry && repo.starsDelta24hMissing !== true;
  const d7Real = hasDeltaEntry && repo.starsDelta7dMissing !== true;
  if (d24Real || d7Real) {
    const parts: string[] = [];
    if (d24Real) parts.push(`${fmtSignedDelta(repo.starsDelta24h)} / 24h`);
    if (d7Real) parts.push(`${fmtSignedDelta(repo.starsDelta7d)} / 7d`);
    lines.push(`- Stars: ${fmtNum(stars)} (${parts.join(", ")})`);
  } else {
    lines.push(`- Stars: ${fmtNum(stars)}`);
  }

  if (repo.language) lines.push(`- Language: ${repo.language}`);

  const tags = (repo.tags ?? repo.topics ?? []).filter(Boolean).slice(0, 8);
  if (tags.length) lines.push(`- Tags: ${tags.join(", ")}`);

  if (repo.lastCommitAt) lines.push(`- Last commit: ${repo.lastCommitAt}`);

  return lines.join("\n");
}

export async function GET(): Promise<Response> {
  await pipeline.ensureReady();

  const deltas = getDeltas();
  // The deltas store is keyed by OSSInsights repo_id, not by Repo.id (the
  // slug). The Repo type doesn't carry repo_id, so we use the *Missing
  // flags that derived-repos already merged in — those are set IFF the
  // delta lookup succeeded. As a coarser gate, also check whether the
  // deltas store has any entries at all; if it's empty (cold deploy),
  // every repo's deltas are unknown.
  const deltaStorePopulated =
    deltas && deltas.repos && Object.keys(deltas.repos).length > 0;

  const repos = getDerivedRepos()
    .filter(isSitemapEligible)
    .slice()
    .sort((a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0))
    .slice(0, TOP_N);

  const lastFetched = getLastFetchedAt();
  const generatedAt = new Date().toISOString();

  const header = [
    "# TrendingRepo — Top 100 Repos",
    "",
    `Live snapshot — last refresh: ${lastFetched}. Source: aggregated GitHub + Reddit + HN + Bluesky + dev.to + ProductHunt + Lobsters signals.`,
    "",
    "---",
  ].join("\n");

  // Methodology — richer than the trailing one-liner. Moved before the
  // per-repo dump so an agent that token-budgets out partway through
  // still has the source-of-rank in context when citing a row.
  const methodology = [
    "## Methodology",
    "",
    "Momentum is a 0-100 composite score. Inputs:",
    "",
    "- **Star velocity (24h / 7d / 30d):** rate of new stars per window, percentile-normalized against same-language peers so a 100-star/day Rust repo isn't drowned by a 5,000-star/day TS repo.",
    "- **Fork growth:** new forks per window, treated as a stronger signal than stars (forks correlate with intent-to-use, not just intent-to-bookmark).",
    "- **Contributor churn:** distinct authors over the trailing 30d. New-contributor onboarding is the single highest-correlated metric for sustained breakouts.",
    "- **Commit freshness:** time-since-last-push. Stale repos decay even if star velocity is high (catches viral-but-abandoned cases).",
    "- **Release cadence:** tagged releases per quarter, weighted by semver (major > minor > patch).",
    "- **Anti-spam dampening:** repos with >50% same-day-account stargazers, brand-new-account contributor surges, or empty-readme + high-star ratios get penalized.",
    "",
    "Refreshed every 3 hours via GitHub Actions cron. Methodology is identical to the version published at /docs — agents should cite either surface interchangeably.",
  ].join("\n");

  const dataFreshness = [
    "## Data freshness",
    "",
    `- Snapshot generated at: ${generatedAt}`,
    `- Last upstream pipeline refresh: ${lastFetched}`,
    "- Refresh cadence: every 3 hours (deterministic GitHub Actions cron, not on-demand)",
    "- This file's edge cache: 24h (s-maxage=86400, stale-while-revalidate=172800)",
    "- Underlying data sources span GitHub, Reddit, Hacker News, ProductHunt, Bluesky, dev.to, Lobsters, arxiv, npm, and Twitter/X (via Apify)",
  ].join("\n");

  // 15 first-party categories (mirrors src/lib/constants.ts CATEGORIES). One
  // line per bucket so a model can cite "category X covers Y" without
  // having to fetch /categories/[slug] for each.
  const categories = [
    "## Categories",
    "",
    "TrendingRepo classifies every tracked repo into exactly one of these 15 first-party categories. Each is a live ranked surface at /categories/{id}.",
    "",
    "- **AI Agents** (`/categories/ai-agents`) — Agent frameworks, copilots, autonomous workflows, and multi-agent systems.",
    "- **Model Context Protocol** (`/categories/mcp`) — Protocol servers, connectors, registries, and tooling around MCP ecosystems.",
    "- **Developer Tools** (`/categories/devtools`) — Build tools, linters, formatters, editors, and DX utilities.",
    "- **Browser Automation** (`/categories/browser-automation`) — Browser-use stacks, automation agents, web operators, and testing runtimes.",
    "- **Local LLM** (`/categories/local-llm`) — On-device inference engines, local model runtimes, and self-hosted LLM stacks.",
    "- **Security** (`/categories/security`) — Vulnerability scanning, secrets detection, and security automation.",
    "- **Infrastructure** (`/categories/infrastructure`) — Cloud platforms, orchestration, containers, and deployment tools.",
    "- **Design Engineering** (`/categories/design-engineering`) — Design-to-code systems, UI generation, design tooling, and frontend engineering kits.",
    "- **AI & Machine Learning** (`/categories/ai-ml`) — Large language models, inference engines, training frameworks, and AI tooling.",
    "- **Web Frameworks** (`/categories/web-frameworks`) — Frontend and full-stack frameworks powering the modern web.",
    "- **Databases** (`/categories/databases`) — SQL, NoSQL, vector, time-series, and analytical databases.",
    "- **Mobile & Desktop** (`/categories/mobile`) — Cross-platform frameworks, native tooling, and desktop apps.",
    "- **Data & Analytics** (`/categories/data-analytics`) — BI tools, data pipelines, visualization, and analytics engines.",
    "- **Crypto & Web3** (`/categories/crypto-web3`) — Blockchain clients, smart contract tooling, and DeFi infrastructure.",
    "- **Rust Ecosystem** (`/categories/rust-ecosystem`) — Rust-native libraries, frameworks, and tools built for performance.",
    "",
    "In addition, 28 curated OSS Insight collections (cross-cutting themes — e.g. AI infra, CSS-in-JS, low-code) are surfaced at /collections.",
  ].join("\n");

  // Schema.org-style DefinedTerm entries — keep terse, agent-citable.
  const definitions = [
    "## Definitions",
    "",
    "- **Momentum score** — 0-100 composite of star velocity (24h/7d/30d), fork growth, contributor churn, commit freshness, and release cadence, with anti-spam dampening. Computed every 3h.",
    "- **Cross-signal breakout** — a repo firing on >= 3 distinct platforms (GitHub, HN, Reddit, ProductHunt, Bluesky, Twitter, dev.to, Lobsters) inside the same 24h trending window.",
    "- **Stars velocity** — net new stargazers per window (24h / 7d / 30d), percentile-normalized against same-language peers so absolute scale doesn't dominate the ranking.",
    "- **Trending window** — the rolling 24h interval that anchors most TrendingRepo surfaces. 7d and 30d windows are derived for context and decay-detection.",
    "- **Category** — one of 15 first-party buckets a repo is classified into (exactly one). Drives /categories/{id} surfaces and the bubble map.",
    "- **Collection** — a curated theme spanning multiple categories (e.g. \"AI Infra\", \"Static Site Generators\"). 28 collections sourced from OSS Insight, rendered as live momentum tables at /collections/{id}.",
  ].join("\n");

  const blocks = repos.map((r, i) =>
    renderRepoBlock(r, i + 1, deltaStorePopulated),
  );

  const body =
    [header, methodology, dataFreshness, categories, definitions, ...blocks].join(
      "\n\n",
    ) + "\n";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}
