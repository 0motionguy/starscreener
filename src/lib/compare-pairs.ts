// Comparison answer-surfaces — the data + gating behind /compare/[...]/vs/.
//
// "X vs Y" is classic AI-Overview + high-intent search bait. To avoid
// thin-content sprawl (millions of possible pairs), generation is gated:
//   - The PAGE 200s only when both repos exist in our index (else notFound).
//   - The SITEMAP advertises only curated in-category pairs where both repos
//     carry a real consensus verdict — a bounded, deterministic set.
// Each page is genuinely differentiated: side-by-side live metrics + each
// repo's verdict prose + a data-grounded "which leads" call.

import { getDerivedRepos } from "@/lib/derived-repos";
import { getConsensusItemReport } from "@/lib/consensus-verdicts";
import { getEditorialCompare } from "@/lib/editorial-compare";
import type { FaqEntry } from "@/lib/seo/structured-data";
import type { Repo } from "@/lib/types";

export interface ComparePair {
  a: string; // owner/name
  b: string; // owner/name
}

/**
 * Parse a catch-all slug (`owner/name/vs/owner/name`) into the two repo
 * fullNames. Returns null for anything that isn't a well-formed pair so the
 * page can 404 cleanly.
 */
export function parseComparePath(slug: string[]): ComparePair | null {
  if (!Array.isArray(slug) || slug.length < 5) return null;
  const vsIndex = slug.findIndex((s) => s.toLowerCase() === "vs");
  if (vsIndex <= 0) return null;
  const left = slug.slice(0, vsIndex);
  const right = slug.slice(vsIndex + 1);
  if (left.length !== 2 || right.length !== 2) return null;
  const a = left.join("/");
  const b = right.join("/");
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return null;
  return { a, b };
}

/** Canonical path for a pair, repos ordered alphabetically for a stable URL. */
export function comparePath(a: string, b: string): string {
  const [first, second] = [a, b].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
  return `/compare/${first}/vs/${second}`;
}

/**
 * Curated in-category pairs for the sitemap: top repos per category that have
 * a consensus verdict, paired within the category. Bounded + deterministic.
 * Caller (sitemap route) must await refreshTrendingFromStore() +
 * refreshConsensusVerdictsFromStore() first.
 */
export function selectComparablePairs(perCategoryTop = 5): ComparePair[] {
  const byCat = new Map<string, Repo[]>();
  for (const r of getDerivedRepos()) {
    const hasVerdict = (() => {
      try {
        const v = getConsensusItemReport(r.fullName);
        return Boolean(v && v.summary.trim().length > 0);
      } catch {
        return false;
      }
    })();
    if (!hasVerdict) continue;
    const list = byCat.get(r.categoryId) ?? [];
    list.push(r);
    byCat.set(r.categoryId, list);
  }

  const pairs: ComparePair[] = [];
  for (const list of byCat.values()) {
    list.sort((a, b) => {
      if (b.momentumScore !== a.momentumScore) return b.momentumScore - a.momentumScore;
      return a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase());
    });
    const top = list.slice(0, perCategoryTop);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const [first, second] = [top[i].fullName, top[j].fullName].sort((x, y) =>
          x.toLowerCase().localeCompare(y.toLowerCase()),
        );
        pairs.push({ a: first, b: second });
      }
    }
  }
  return pairs;
}

export function buildCompareFaq(repoA: Repo, repoB: Repo): FaqEntry[] {
  const a = repoA.fullName;
  const b = repoB.fullName;
  const leader = compareLeader(repoA, repoB);
  return [
    {
      q: `${repoA.name} vs ${repoB.name}: which has more momentum right now?`,
      a:
        leader.tie
          ? `${a} and ${b} are closely matched on TrendingRepo's momentum score right now.`
          : `${leader.winnerFullName} currently leads on TrendingRepo's cross-source momentum score (${Math.round(
              leader.winnerMomentum,
            )} vs ${Math.round(leader.loserMomentum)}), which weights recent star velocity and cross-platform mentions, not just total stars.`,
    },
    {
      q: `Which has more GitHub stars, ${repoA.name} or ${repoB.name}?`,
      a: `${repoA.fullName} has ${fmt(repoA.stars)} stars; ${repoB.fullName} has ${fmt(repoB.stars)}.`,
    },
    {
      q: `Are ${repoA.name} and ${repoB.name} both open source?`,
      a: `Yes — both are open-source repositories on GitHub. ${repoA.fullName} is ${repoA.language ?? "multi-language"}; ${repoB.fullName} is ${repoB.language ?? "multi-language"}.`,
    },
  ];
}

export interface CompareLeader {
  tie: boolean;
  winnerFullName: string;
  winnerMomentum: number;
  loserMomentum: number;
}

export function compareLeader(repoA: Repo, repoB: Repo): CompareLeader {
  const ma = repoA.momentumScore ?? 0;
  const mb = repoB.momentumScore ?? 0;
  if (Math.abs(ma - mb) < 1) {
    return { tie: true, winnerFullName: repoA.fullName, winnerMomentum: ma, loserMomentum: mb };
  }
  return ma >= mb
    ? { tie: false, winnerFullName: repoA.fullName, winnerMomentum: ma, loserMomentum: mb }
    : { tie: false, winnerFullName: repoB.fullName, winnerMomentum: mb, loserMomentum: ma };
}

/**
 * Canonical editorial-store key for a pair — fullNames sorted alphabetically,
 * matching the worker's compareKey (editorial-compare/prompt.ts) and comparePath.
 */
export function compareEditorialKey(a: string, b: string): string {
  const [first, second] = [a, b].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
  return `${first}__vs__${second}`;
}

/**
 * Intro paragraph for a compare page. Prefers the LLM-written "X vs Y" framing
 * (worker `editorial-compare` slug) when present — the comparative analysis
 * answer engines cite — else a deterministic description. Always appends the
 * data-grounded "which leads" call (live momentum, never fabricated by the LLM).
 * Caller must have awaited refreshEditorialCompareFromStore().
 */
export function buildCompareIntro(repoA: Repo, repoB: Repo, leader: CompareLeader): string {
  const leadLine = leader.tie
    ? `Both are closely matched on momentum right now.`
    : `${leader.winnerFullName} currently leads on cross-source momentum.`;
  const editorial = getEditorialCompare(compareEditorialKey(repoA.fullName, repoB.fullName));
  if (editorial?.overview) {
    return `${editorial.overview} ${leadLine}`;
  }
  const base = `A live side-by-side comparison of ${repoA.name} and ${repoB.name} — GitHub stars, momentum score, star velocity and cross-source mentions, refreshed continuously.`;
  return `${base} ${leadLine}`;
}

function fmt(n: number | undefined): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
}
