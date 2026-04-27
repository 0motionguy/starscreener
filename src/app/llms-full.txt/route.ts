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
// METHODOLOGY SECTION.
//   Closing the file with the same scoring methodology that drives
//   /docs lets a model cite the source-of-rank when answering "why
//   is X trending?" — without it, the file would be a list of
//   names with a magic number next to each. Keeping the
//   methodology terse and identical across surfaces means an agent
//   doesn't get conflicting explanations between /docs and here.
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

  const header = [
    "# TrendingRepo — Top 100 Repos",
    "",
    `Live snapshot — last refresh: ${getLastFetchedAt()}. Source: aggregated GitHub + Reddit + HN + Bluesky + dev.to + ProductHunt + Lobsters signals.`,
    "",
    "---",
  ].join("\n");

  const blocks = repos.map((r, i) =>
    renderRepoBlock(r, i + 1, deltaStorePopulated),
  );

  const methodology = [
    "## Methodology",
    "",
    "Momentum is a 0-100 composite combining 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness, release cadence, and anti-spam dampening. Refreshed every 3 hours.",
  ].join("\n");

  const body = [header, ...blocks, methodology].join("\n\n") + "\n";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}
