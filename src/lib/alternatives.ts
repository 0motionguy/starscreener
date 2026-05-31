// "Alternatives to X" answer-surface helpers — /alternatives/[owner]/[name].
//
// "alternatives to <repo>" is a high-intent search + AI-Overview query. We
// answer it from same-category peers ranked by cross-source momentum — real
// differentiated data, not a scraped list. Gated: the target must exist and
// have >= MIN_PEERS in-category alternatives, else the page 404s (no thin
// near-empty comparisons).

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { getCategoryMeta, getCategoryRepos } from "@/lib/categories";
import { getEditorialAlternatives } from "@/lib/editorial-alternatives";
import type { FaqEntry } from "@/lib/seo/structured-data";
import type { Repo } from "@/lib/types";

export const MIN_ALTERNATIVES = 3;

export interface AlternativesResult {
  target: Repo | null;
  alternatives: Repo[];
  categoryName: string | null;
}

export function getAlternatives(fullName: string, limit = 12): AlternativesResult {
  const target = (() => {
    try {
      return getDerivedRepoByFullName(fullName);
    } catch {
      return null;
    }
  })();
  if (!target) return { target: null, alternatives: [], categoryName: null };

  const peers = getCategoryRepos(target.categoryId, 200).filter(
    (r) => r.fullName.toLowerCase() !== fullName.toLowerCase(),
  );
  return {
    target,
    alternatives: peers.slice(0, limit),
    categoryName: getCategoryMeta(target.categoryId)?.name ?? null,
  };
}

function fmt(n: number | undefined): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function buildAlternativesIntro(target: Repo, alts: Repo[], categoryName: string | null): string {
  const cat = categoryName ? categoryName.toLowerCase() : "open-source";
  const ctx = ` ${target.name} has ${fmt(target.stars)} stars; ${alts.length} comparable ${alts.length === 1 ? "project" : "projects"} are ranked below as of ${todayLabel()}.`;
  // Prefer the LLM-written "alternatives to X" framing (worker
  // `editorial-alternatives` slug) when present — then append the live stats.
  // Caller must have awaited refreshEditorialAlternativesFromStore(). Falls back
  // to the deterministic lead when no overview is stored.
  const editorial = getEditorialAlternatives(target.fullName);
  if (editorial?.overview) {
    return `${editorial.overview}${ctx}`;
  }
  const lead = `Looking for alternatives to ${target.fullName}? These are the top open-source ${cat} projects on TrendingRepo, ranked by cross-source momentum — GitHub star velocity weighted with mentions on Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to.`;
  return `${lead}${ctx}`;
}

export function buildAlternativesFaq(target: Repo, alts: Repo[], categoryName: string | null): FaqEntry[] {
  const top = alts.slice(0, 5).map((r) => r.fullName);
  const list =
    top.length === 0
      ? ""
      : top.length === 1
        ? top[0]
        : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  const cat = categoryName ?? "this category";
  const out: FaqEntry[] = [];

  out.push({
    q: `What are the best alternatives to ${target.name}?`,
    a:
      list.length > 0
        ? `As of ${todayLabel()}, the top open-source alternatives to ${target.fullName} are ${list} — same-category projects ranked by TrendingRepo's cross-source momentum score.`
        : `TrendingRepo ranks same-category alternatives by a cross-source momentum score across GitHub, Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to.`,
  });

  const topAlt = alts[0];
  if (topAlt) {
    out.push({
      q: `Is ${target.name} better than ${topAlt.name}?`,
      a: `It depends on your needs — both are in ${cat}. By the numbers, ${target.fullName} has ${fmt(target.stars)} stars and a momentum score of ${Math.round(target.momentumScore ?? 0)}; ${topAlt.fullName} has ${fmt(topAlt.stars)} stars and momentum ${Math.round(topAlt.momentumScore ?? 0)}. Compare them side by side on TrendingRepo.`,
    });
  }

  out.push({
    q: `Are these alternatives open source?`,
    a: `Yes — every project listed is an open-source repository on GitHub. TrendingRepo only ranks open-source code.`,
  });

  out.push({
    q: `How are these alternatives ranked?`,
    a: `By a 0-100 momentum score combining 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness and release cadence, with cross-source mention signals layered on and anti-spam dampening applied — refreshed roughly every 20 minutes.`,
  });

  return out;
}
