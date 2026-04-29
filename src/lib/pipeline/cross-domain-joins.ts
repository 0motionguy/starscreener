// Cross-domain join resolver — paper ↔ repo ↔ HF model triple-join surface.
//
// PURPOSE
//   Build a flat join graph keyed by arxivId so a repo detail page can
//   answer "which papers cite this repo and which HF models reference
//   either"; and surface symmetric per-repo links so list rows can mark
//   repos that have arxiv/HF backing.
//
// JOIN SOURCES (best-effort — pure logic over snapshots)
//   - paper.linkedRepos[].fullName  → set by scripts/scrape-arxiv.mjs.
//     The current snapshot reports linkedRepoCount=0; the resolver still
//     handles non-empty sets correctly when enrichment lands.
//   - HF model.tags[]  → entries shaped `arxiv:<bareId>` link a model to
//     a paper. The trending HF list endpoint returns these in `tags`
//     directly (verified in data/huggingface-trending.json — 30+ tags
//     present in the snapshot we ship).
//
// LIMITATION
//   Public HF /api/models list does NOT return `card_data`, so we have
//   no `card_data.repository` field — there is no first-class HF model
//   → repo edge today. We attempt a best-effort scan of `tags[]` for
//   any `repository:<owner>/<name>` convention; in practice this shape
//   is absent from the snapshot, so `linkedHfModels` for a repo will
//   typically only populate via the indirect route paper.linkedRepos →
//   paper.arxivId → hf.tags. That indirect path covers the 80% case
//   (research-paper code releases) and is documented as a known gap
//   for the integration work.
//
// CARDINALITY (plan §5)
//   - Paper → N repos: keep all, sort follows caller's repo input order.
//   - Repo ← M papers: same — preserve insertion order.
//   - Repos referenced by a paper but absent from our corpus stay in
//     the graph entry's `linkedRepos` array (discovery signal — the
//     renderer treats them as plaintext rather than filtering).
//
// ID NORMALIZATION
//   Arxiv IDs in `arxiv-recent.json` carry version suffixes ("2604.24758v1").
//   HF tags use bare IDs ("arxiv:2604.20796"). The graph stores BOTH the
//   bare and versioned forms as lookup keys so callers can hit either.
//
// INTEGRATION RECIPE (for the next chunk — not done here)
//   1. After refreshArxivFromStore() and refreshHfModelsFromStore(),
//      grab the current cached files via getArxivRecentFile() and
//      getHfTrendingFile().
//   2. Call buildPaperGraph(arxivPapers, hfModels) once per refresh
//      and stash the resulting Map alongside the derived-repos cache.
//   3. In getDerivedRepos(), call attachCrossDomainJoins(repos, graph,
//      hfModels) AFTER attachCrossSignal() — the augmentation is
//      additive and order-stable so it composes cleanly.

import type { ArxivLinkedRepo } from "../arxiv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperGraphEntry {
  arxivId: string; // bare form (no version suffix)
  title: string;
  linkedRepos: string[]; // owner/name fullNames (deduped, insertion order)
  linkedHfModels: string[]; // org/model HF ids (deduped, insertion order)
}

export type PaperGraph = Map<string, PaperGraphEntry>;

export interface ArxivPaperJoinInput {
  arxivId: string;
  title: string;
  linkedRepos: Pick<ArxivLinkedRepo, "fullName">[];
}

export interface HfModelJoinInput {
  id: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

/** Strip a trailing version suffix like "v1", "v12" — leave bare ID. */
function bareArxivId(id: string): string {
  return id.replace(/v\d+$/i, "");
}

/** Pull `arxiv:<id>` references out of an HF model's `tags` array. */
function arxivTagsOf(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    if (!t.startsWith("arxiv:")) continue;
    const id = bareArxivId(t.slice("arxiv:".length).trim());
    if (id) out.push(id);
  }
  return out;
}

/** Best-effort scan for `repository:owner/name` tags. Today this shape is
 *  not present in the public list response — kept for forward-compat with
 *  any future tag convention or scraper enrichment. */
function repositoryTagsOf(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    if (!t.startsWith("repository:")) continue;
    const repo = t.slice("repository:".length).trim();
    // Only accept canonical owner/name shape.
    if (/^[\w.-]+\/[\w.-]+$/.test(repo)) out.push(repo);
  }
  return out;
}

function pushUnique(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/**
 * Build the paper graph from arxiv + HF inputs.
 *
 * One entry per UNIQUE bare arxivId. Both bare and versioned IDs index
 * to the same entry so callers can look up either form.
 *
 * Pure — no side effects, no I/O.
 */
export function buildPaperGraph(
  arxivPapers: ArxivPaperJoinInput[],
  hfModels: HfModelJoinInput[],
): PaperGraph {
  const graph: PaperGraph = new Map();

  // Pass 1 — seed entries from papers and their linked repos.
  for (const paper of arxivPapers) {
    if (!paper?.arxivId) continue;
    const bareId = bareArxivId(paper.arxivId);
    let entry = graph.get(bareId);
    if (!entry) {
      entry = {
        arxivId: bareId,
        title: paper.title ?? "",
        linkedRepos: [],
        linkedHfModels: [],
      };
      graph.set(bareId, entry);
      // Mirror the entry under the versioned form too, when distinct.
      if (paper.arxivId !== bareId) graph.set(paper.arxivId, entry);
    }
    for (const r of paper.linkedRepos ?? []) {
      if (r?.fullName) pushUnique(entry.linkedRepos, r.fullName);
    }
  }

  // Pass 2 — fold HF models into entries via `arxiv:<id>` tags.
  for (const m of hfModels) {
    if (!m?.id) continue;
    const arxivIds = arxivTagsOf(m.tags);
    for (const aid of arxivIds) {
      const entry = graph.get(aid);
      if (!entry) {
        // The model references a paper that's not in the current
        // arxiv snapshot (older paper, or rotated out of the recent
        // window). Skip — we only surface joins for papers we know.
        continue;
      }
      pushUnique(entry.linkedHfModels, m.id);
    }
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Per-repo augmentation
// ---------------------------------------------------------------------------

/**
 * Augment a repo array with `linkedArxivIds` + `linkedHfModels`. Pure.
 *
 * - `linkedArxivIds` collects every paper whose `linkedRepos` includes
 *   the repo's `fullName` (bare arxivIds, no version suffix).
 * - `linkedHfModels` collects, in this order:
 *     a) HF models whose `tags[]` carry `repository:<repo.fullName>`
 *        (best-effort, currently unused by the snapshot — see header).
 *     b) HF models reached transitively via paper.linkedRepos →
 *        paper.arxivId → hf.tags `arxiv:<id>`.
 *
 * Output preserves caller's input ordering. Repo objects without joins
 * receive empty arrays (NOT undefined) so consumers can branch on
 * `.length === 0` consistently.
 */
export function attachCrossDomainJoins<T extends { fullName: string }>(
  repos: T[],
  paperGraph: PaperGraph,
  hfModels: HfModelJoinInput[],
): Array<T & { linkedArxivIds: string[]; linkedHfModels: string[] }> {
  // Pre-index repo→arxivIds + repo→hfModels via the paper graph.
  // Iterate the graph ONCE so each augmentation is O(repoCount + paperCount).
  const repoToArxiv = new Map<string, string[]>();
  const repoToHf = new Map<string, string[]>();

  // Use a Set of seen entries to avoid double-counting when both bare and
  // versioned forms are stored under the same entry object.
  const seen = new Set<PaperGraphEntry>();
  for (const entry of paperGraph.values()) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    for (const fullName of entry.linkedRepos) {
      const arxivList = repoToArxiv.get(fullName) ?? [];
      pushUnique(arxivList, entry.arxivId);
      repoToArxiv.set(fullName, arxivList);

      // Transitive HF models — every model linked to this paper is also
      // implicitly linked to every repo the paper cites.
      if (entry.linkedHfModels.length > 0) {
        const hfList = repoToHf.get(fullName) ?? [];
        for (const hfId of entry.linkedHfModels) pushUnique(hfList, hfId);
        repoToHf.set(fullName, hfList);
      }
    }
  }

  // Best-effort direct repo→HF via `repository:` tags (stays empty
  // today; documented in module header).
  for (const m of hfModels) {
    if (!m?.id) continue;
    const repoTags = repositoryTagsOf(m.tags);
    for (const rt of repoTags) {
      const hfList = repoToHf.get(rt) ?? [];
      pushUnique(hfList, m.id);
      repoToHf.set(rt, hfList);
    }
  }

  return repos.map((repo) => ({
    ...repo,
    linkedArxivIds: repoToArxiv.get(repo.fullName) ?? [],
    linkedHfModels: repoToHf.get(repo.fullName) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Single-repo lookup (detail-page helper)
// ---------------------------------------------------------------------------

/**
 * Resolve joins for one repo — same algorithm as `attachCrossDomainJoins`
 * but scoped to a single fullName. Returns empty arrays when no joins
 * exist (NOT undefined) so callers don't have to null-guard.
 */
export function getJoinsForRepo(
  fullName: string,
  paperGraph: PaperGraph,
  hfModels: HfModelJoinInput[],
): { linkedArxivIds: string[]; linkedHfModels: string[] } {
  const linkedArxivIds: string[] = [];
  const linkedHfModels: string[] = [];

  const seen = new Set<PaperGraphEntry>();
  for (const entry of paperGraph.values()) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    if (!entry.linkedRepos.includes(fullName)) continue;
    pushUnique(linkedArxivIds, entry.arxivId);
    for (const hf of entry.linkedHfModels) pushUnique(linkedHfModels, hf);
  }

  for (const m of hfModels) {
    if (!m?.id) continue;
    if (repositoryTagsOf(m.tags).includes(fullName)) pushUnique(linkedHfModels, m.id);
  }

  return { linkedArxivIds, linkedHfModels };
}

// Internal helpers exported strictly for unit tests.
export const __test = {
  bareArxivId,
  arxivTagsOf,
  repositoryTagsOf,
};
