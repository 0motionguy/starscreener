// StarScreener — GitHub raw → Repo normalization.
//
// Pure, synchronous transform from the upstream adapter shapes into the public
// Repo type. Does not compute deltas, momentum, category, or social signals —
// those fields are populated by later pipeline stages (delta engine, scorer,
// classifier, social aggregator) and are initialized to safe zero/placeholder
// values here.

import { slugToId } from "@/lib/utils";
import type { Repo } from "@/lib/types";
import type { GitHubRepoRaw, GitHubReleaseRaw } from "../types";
import { normalizeHost as normalizeHostFromFunding } from "@/lib/funding/match";

// Re-export `normalizeHost` from the funding matcher so the pipeline layer
// has a single import surface for URL/host normalization. Duplicating the
// implementation would drift over time; re-export keeps one source of truth.
export const normalizeHost = normalizeHostFromFunding;

// ---------------------------------------------------------------------------
// URL normalization — dedup-friendly canonical form for RepoMention.url
// ---------------------------------------------------------------------------

/**
 * Tracking / analytics query params that carry zero semantic identity and
 * should be stripped before dedup. Keep the list conservative — only params
 * known to be ignorable across every major platform we ingest from.
 */
const TRACKING_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "ref",
  "ref_src",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "s", // twitter share token
  "t", // twitter timestamp
]);

/** Returns true if a query key is one of our known-tracking params. */
function isTrackingParam(key: string): boolean {
  if (TRACKING_QUERY_PARAMS.has(key)) return true;
  // Strip the entire utm_* family (utm_source, utm_medium, utm_campaign, …).
  if (key.startsWith("utm_")) return true;
  return false;
}

/**
 * Normalize a URL to a canonical form suitable for dedup.
 *
 * Rules:
 *   - null / undefined / empty → null.
 *   - lowercase host, strip a leading `www.`.
 *   - drop tracking query params (utm_*, ref, fbclid, gclid, mc_cid, mc_eid,
 *     _ga, s, t). Remaining params are kept but sorted alphabetically so two
 *     semantically equivalent URLs with shuffled query orders dedup.
 *   - strip fragment.
 *   - strip trailing slash from pathname unless the pathname is root (`/`).
 *   - leave scheme as-is — we don't want to force https and miss an intentional
 *     http URL, and we don't want to hardcode a host allow-list here.
 *
 * Robustness: malformed input doesn't throw. We fall back to a lowercased
 * trimmed form so the dedup key is at least deterministic, even if not ideal.
 */
export function normalizeUrl(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a parseable absolute URL. Return a deterministic lowercased form so
    // downstream dedup still works, but don't throw — adapters can emit weird
    // strings (e.g. bare domains) we don't want to crash the store on.
    return trimmed.toLowerCase();
  }

  // Host: lowercase + strip leading "www.". URL.hostname is already lowercased
  // by the parser, but we normalize explicitly to be defensive.
  let host = url.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  url.hostname = host;

  // Pathname: strip a single trailing slash unless the whole path is just "/".
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  }

  // Drop tracking params, keep remaining params in alphabetically-sorted order
  // so the serialized form is deterministic regardless of input ordering.
  const keep: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (isTrackingParam(key)) continue;
    keep.push([key, value]);
  }
  keep.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });

  // Rebuild the query string from the sorted/filtered list. Clearing via
  // `url.search = ""` and re-appending avoids URL's internal ordering quirks.
  url.search = "";
  for (const [key, value] of keep) {
    url.searchParams.append(key, value);
  }

  // Drop fragment — never part of identity for our purposes.
  url.hash = "";

  return url.toString();
}

/**
 * Normalize a GitHub REST API repo payload (plus optional latest release and
 * contributor count) into a Repo record ready for persistence.
 *
 * Downstream pipeline stages own:
 *   - categoryId           → classifier
 *   - *Delta* fields       → delta engine
 *   - momentumScore        → scorer
 *   - movementStatus       → scorer
 *   - rank / categoryRank  → rank engine
 *   - sparklineData        → snapshot rollup
 *   - socialBuzzScore, mentionCount24h → social aggregator
 */
export function normalizeGitHubRepo(
  raw: GitHubRepoRaw,
  release: GitHubReleaseRaw | null,
  contributorCount: number,
): Repo {
  return {
    id: slugToId(raw.full_name),
    fullName: raw.full_name,
    name: raw.name,
    owner: raw.owner.login,
    ownerAvatarUrl: raw.owner.avatar_url,
    description: raw.description ?? "",
    url: raw.html_url,
    language: raw.language,
    topics: raw.topics ?? [],
    categoryId: "other",

    stars: raw.stargazers_count,
    forks: raw.forks_count,
    contributors: contributorCount,
    openIssues: raw.open_issues_count,

    // GitHub's best public proxy for "last commit" on the default branch.
    lastCommitAt: raw.pushed_at,
    lastReleaseAt: release?.published_at ?? null,
    lastReleaseTag: release?.tag_name ?? null,
    createdAt: raw.created_at,

    // Deltas — filled by the delta engine once we have history.
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,

    // Scoring — filled by the scorer.
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,

    // Rolled up from snapshots later.
    sparklineData: [],

    // Filled by social aggregator.
    socialBuzzScore: 0,
    mentionCount24h: 0,

    // Tags — filled by deriveTags() during classify pass.
    tags: [],
  };
}
