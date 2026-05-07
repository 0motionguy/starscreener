// Live GitHub repo fetcher — fallback for repos NOT in our curated set.
//
// The detail page (/repo/[owner]/[name]) historically 404s when the repo
// isn't in `getDerivedRepoByFullName`. That blocks any sharing of detail
// links to repos we haven't picked up via trending / manual-repos / pipeline
// JSONL yet. This module hits the GitHub API once per repo, caches in Redis
// (1h TTL) for warm-Lambda reuse, and synthesizes a minimal `Repo` so the
// detail page can render its full layout against an empty cross-source set.
//
// Failure modes:
//   - GitHub 404 → returns null (page caller calls notFound())
//   - GitHub rate-limit or transient error → returns null + logs (page also
//     calls notFound() rather than rendering a half-broken page)
//   - GITHUB_TOKEN missing → still tries unauthenticated; at risk of the
//     low rate-limit (60/h per IP). Production has the token set.

import type { Repo } from "./types";
import { slugToId } from "./utils";
import { githubFetch } from "./github-fetch";

const LIVE_REPO_KEY_PREFIX = "ss:live-repo:v1:";
const LIVE_REPO_TTL_SECONDS = 60 * 60; // 1h

interface GitHubRepoApiResponse {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  created_at: string;
  archived?: boolean;
  disabled?: boolean;
  default_branch?: string;
}

/**
 * Hit the GitHub REST API for repo metadata via the pool-aware `githubFetch`
 * helper so we share rate-limit accounting with the rest of the engine.
 * Returns `null` on 404, rate-limit exhaustion, network error, or non-JSON
 * response. Caller treats null as "the repo doesn't exist (or we can't
 * reach it)" → notFound().
 */
async function fetchFromGitHub(
  owner: string,
  name: string,
): Promise<GitHubRepoApiResponse | null> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  let result;
  try {
    result = await githubFetch(path, { operation: "live-repo-fetch" });
  } catch (err) {
    console.error("[github-live] fetch failed", owner, name, err);
    return null;
  }
  if (!result) return null; // pool exhausted / persistent network failure
  const { response: res } = result;
  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(
      "[github-live] non-OK",
      res.status,
      `${owner}/${name}`,
      res.headers.get("x-ratelimit-remaining"),
    );
    return null;
  }
  try {
    const json = (await res.json()) as GitHubRepoApiResponse;
    if (!json?.full_name) return null;
    return json;
  } catch (err) {
    console.error("[github-live] non-JSON response", owner, name, err);
    return null;
  }
}

/**
 * Synthesize a minimal `Repo` from a GitHub API response so the detail-page
 * stack — most of which expects a fully-populated Repo — can render. Cross-
 * source signal fields (mentions, scores, deltas) are zero by design: this
 * repo isn't in our pipeline yet. The detail page surfaces a "tracking
 * started" banner so users understand why every chip is empty.
 */
export function synthesizeRepoFromGitHub(gh: GitHubRepoApiResponse): Repo {
  const id = slugToId(gh.full_name);
  return {
    id,
    fullName: gh.full_name,
    name: gh.name,
    owner: gh.owner.login,
    ownerAvatarUrl: gh.owner.avatar_url ?? "",
    description: gh.description ?? "",
    url: gh.html_url,
    language: gh.language ?? null,
    topics: Array.isArray(gh.topics) ? gh.topics : [],
    categoryId: "other",
    stars: gh.stargazers_count ?? 0,
    forks: gh.forks_count ?? 0,
    contributors: 0,
    openIssues: gh.open_issues_count ?? 0,
    lastCommitAt: gh.pushed_at ?? gh.created_at,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: gh.created_at,
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    hasMovementData: false,
    starsDelta24hMissing: true,
    starsDelta7dMissing: true,
    starsDelta30dMissing: true,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    mentions: null,
    archived: gh.archived ?? false,
    deleted: false,
  };
}

/**
 * Resolve a repo by `owner/name` for the detail page. Tries Redis-cached
 * GitHub metadata first, then a live API call, then null. Cached payloads
 * include the synthesized `Repo` so warm Lambdas skip both the API hit AND
 * the synthesis pass.
 */
export async function fetchGitHubRepoLive(
  owner: string,
  name: string,
): Promise<Repo | null> {
  const cacheKey = `${LIVE_REPO_KEY_PREFIX}${owner.toLowerCase()}/${name.toLowerCase()}`;
  // Lazy data-store import — avoids dragging ioredis into client bundles
  // through transitive type re-exports.
  const { getDataStore } = await import("./data-store");
  const store = getDataStore();
  try {
    const cached = await store.read<Repo>(cacheKey);
    if (cached.data && cached.source !== "missing") return cached.data;
  } catch (err) {
    console.warn("[github-live] cache read failed", err);
  }
  const gh = await fetchFromGitHub(owner, name);
  if (!gh) return null;
  const repo = synthesizeRepoFromGitHub(gh);
  try {
    await store.write(cacheKey, repo, { ttlSeconds: LIVE_REPO_TTL_SECONDS });
  } catch (err) {
    console.warn("[github-live] cache write failed", err);
  }
  return repo;
}
