// Thin server-side loader for related-repo suggestions on the profile page.
//
// Delegates to `getDerivedRelatedRepos(source, limit)` from derived-insights
// and narrows the full `Repo` shape down to the fields the RelatedReposPanel
// actually renders. The underlying derived layer is already cached
// (getDerivedRepos memoizes by data-version), so no extra caching is needed
// here — this module is just a shape-shifter + lookup.
//
// Contract:
//   - Input is a GitHub `owner/name` string (case-insensitive).
//   - Output is at most 6 items, sorted by whatever ordering
//     getDerivedRelatedRepos already produces (score desc, momentum desc,
//     24h-stars desc). We MUST NOT reorder — the derived layer owns ranking.
//   - Unknown repo or no candidates → empty array.
//
// The `relation` field is declared optional because the current
// getDerivedRelatedRepos scorer does not emit a typed relation label (it
// scores on shared category / language / tags / collections). We leave the
// field on the interface so the component can render a pill if/when the
// derived scorer starts tagging relation types.

import { getDerivedRelatedRepos } from "./derived-insights";
import { getDerivedRepoByFullName } from "./derived-repos";

export interface RelatedRepoItem {
  fullName: string;
  ownerAvatarUrl?: string | null;
  stars: number;
  language?: string | null;
  momentumScore: number;
  description?: string | null;
  /**
   * Relation classification, when the derived scorer can attach one. The
   * current implementation does not emit this, so consumers should treat
   * `undefined` as "unspecified / generic similarity".
   */
  relation?: "fork" | "replacement" | "similar" | "sibling";
}

const MAX_ITEMS = 6;

/**
 * Return up to 6 related/competing repos for the given `owner/name`.
 *
 * Returns an empty array when the source repo is unknown or when the
 * derived scorer produces no candidates. The ordering is whatever
 * getDerivedRelatedRepos produces — do not resort here.
 */
export function getRelatedReposFor(fullName: string): RelatedRepoItem[] {
  if (!fullName || !fullName.includes("/")) return [];

  const source = getDerivedRepoByFullName(fullName);
  if (!source) return [];

  const related = getDerivedRelatedRepos(source, MAX_ITEMS);
  if (related.length === 0) return [];

  return related.map((repo) => ({
    fullName: repo.fullName,
    ownerAvatarUrl: repo.ownerAvatarUrl || null,
    stars: repo.stars,
    language: repo.language ?? null,
    momentumScore: repo.momentumScore,
    description: repo.description?.trim() ? repo.description : null,
  }));
}
