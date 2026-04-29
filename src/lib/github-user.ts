// GitHub user (or organization) profile fetcher for the repo detail page's
// MaintainerCard. Server-only — uses the GITHUB_TOKEN env when available so
// we don't burn through the 60 req/h unauthenticated rate limit on busy
// builds, and falls back to anonymous otherwise.
//
// The fetch is wrapped in Next's revalidate option (24h ISR window) because
// user profiles change rarely; if Next sees a cached response under that
// window it serves it from disk without a network round-trip.
//
// Errors (rate limit, deleted user, network) intentionally return `null`
// rather than throwing — the MaintainerCard renders a graceful fallback so
// a transient GitHub blip never breaks the repo page.
//
// SAFETY: never log the token. The fetch caller is server-only and the
// returned object is JSON-serializable for the React server component.
//
// Why not reuse github-compare.ts: that module is built around a 7-endpoint
// bundle with retry + backoff machinery for the /compare page. The
// MaintainerCard needs exactly one endpoint and survives a miss — keep
// the surface tiny.

import { githubFetch } from "./github-fetch";

const REVALIDATE_SECONDS = 24 * 60 * 60; // 24h ISR window

export type GithubAccountType = "User" | "Organization";

export interface GithubUserProfile {
  login: string;
  /** "User" for individuals, "Organization" for org accounts. */
  type: GithubAccountType;
  /** Display name when the user/org has one set; falls back to login. */
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  location: string | null;
  /** Optional company (filled in for some user profiles). */
  company: string | null;
  /** Personal website / blog. May be empty string in the API; we coerce to null. */
  blog: string | null;
  /** Twitter/X handle (no leading @). May be empty string in the API; coerce to null. */
  twitterUsername: string | null;
  publicRepos: number;
  followers: number;
}

interface RawGithubUserResponse {
  login?: unknown;
  type?: unknown;
  name?: unknown;
  avatar_url?: unknown;
  html_url?: unknown;
  bio?: unknown;
  location?: unknown;
  company?: unknown;
  blog?: unknown;
  twitter_username?: unknown;
  public_repos?: unknown;
  followers?: unknown;
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asAccountType(v: unknown): GithubAccountType {
  return v === "Organization" ? "Organization" : "User";
}

/**
 * Fetch a single GitHub user/org profile. Returns `null` on any failure
 * (404, 403/rate-limit, network error, malformed JSON). Caller is expected
 * to render a fallback in the null case.
 */
export async function fetchGithubUserProfile(
  login: string,
): Promise<GithubUserProfile | null> {
  if (!login || !/^[A-Za-z0-9-]+$/.test(login)) {
    return null;
  }

  const result = await githubFetch(`/users/${login}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    cache: "default",
  });
  if (!result || !result.response.ok) {
    return null;
  }

  let raw: RawGithubUserResponse;
  try {
    raw = (await result.response.json()) as RawGithubUserResponse;
  } catch {
    return null;
  }

  const loginOut = asString(raw.login);
  const avatarOut = asString(raw.avatar_url);
  if (!loginOut || !avatarOut) {
    return null;
  }

  return {
    login: loginOut,
    type: asAccountType(raw.type),
    name: asString(raw.name),
    avatarUrl: avatarOut,
    htmlUrl: asString(raw.html_url) ?? `https://github.com/${loginOut}`,
    bio: asString(raw.bio),
    location: asString(raw.location),
    company: asString(raw.company),
    blog: asString(raw.blog),
    twitterUsername: asString(raw.twitter_username),
    publicRepos: asNumber(raw.public_repos),
    followers: asNumber(raw.followers),
  };
}
