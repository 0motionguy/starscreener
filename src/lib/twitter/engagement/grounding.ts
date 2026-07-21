// X engagement — reply grounding.
//
// The reply composer must cite REAL repos + REAL stats, never invented ones.
// This loads the current top-signal trending repos from our own data-store
// (the same enriched view the homepage renders) and formats them as a grounding
// block. The composer is instructed to cite ONLY repos/stats from this block —
// with it wired, "threestudio-compare, 2x velocity" style hallucinations can't
// happen because the model has real names + numbers to reach for (or nothing,
// in which case it must skip or stay non-numeric).

import "server-only";

import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

function fmtStars(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function formatRepoLine(r: Repo): string {
  const d24 = r.starsDelta24h ? `+${r.starsDelta24h}/24h` : "";
  const d7 = r.starsDelta7d ? `+${r.starsDelta7d}/7d` : "";
  const deltas = [d24, d7].filter(Boolean).join(", ");
  const lang = r.language ? `, ${r.language}` : "";
  const mom = Number.isFinite(r.momentumScore) ? `, momentum ${Math.round(r.momentumScore)}` : "";
  const desc = (r.description || "").replace(/\s+/g, " ").slice(0, 72);
  return `${r.fullName} (${fmtStars(r.stars)} stars${deltas ? `, ${deltas}` : ""}${mom}${lang})${desc ? `: ${desc}` : ""}`;
}

/**
 * Load the top-signal trending repos as a grounding block for the reply
 * composer. Real names + real stats only. Returns "" if the data-store is cold
 * or empty (the composer then must not name a repo / cite a number).
 */
export async function loadTrendingGrounding(limit = 14): Promise<string> {
  try {
    await Promise.all([
      refreshTrendingFromStore().catch(() => undefined),
      refreshRepoRegistryFromStore().catch(() => undefined),
    ]);
    const repos = getDerivedRepos();
    if (!repos.length) return "";
    const top = [...repos]
      .filter((r) => typeof r.fullName === "string" && r.fullName.includes("/"))
      .sort(
        (a, b) =>
          (b.momentumScore ?? 0) - (a.momentumScore ?? 0) ||
          (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0),
      )
      .slice(0, Math.max(1, limit));
    return top.map(formatRepoLine).join("\n");
  } catch {
    return "";
  }
}
