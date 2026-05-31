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
  // Prefer the LLM-written expert overview (worker `editorial-categories` slug)
  // when present — evergreen definitional prose answer-engines cite — then
  // append the live tracking count + top movers. Caller must have awaited
  // refreshEditorialCategoriesFromStore(). Falls back to the deterministic lead
  // when no overview is stored (no Redis locally, or worker hasn't run yet).
  const editorial = getEditorialCategories(meta.id);
  if (editorial?.overview) {
    return `${editorial.overview}${tracking}${top}`;
  }
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
