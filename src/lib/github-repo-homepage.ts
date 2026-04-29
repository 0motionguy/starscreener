// Lightweight GitHub repo homepage resolver for repo detail enrichment.
//
// The committed repo-metadata snapshot now supports homepageUrl, but older
// snapshots do not contain it. This fallback lets website/AISO enrichment work
// immediately while still returning null on API errors or rate limits.

import { readEnv } from "@/lib/env-helpers";
import { githubFetch } from "@/lib/github-fetch";

const REVALIDATE_SECONDS = 6 * 60 * 60;

interface RawGithubRepoResponse {
  homepage?: unknown;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanHomepage(value: unknown): string | null {
  const raw = asString(value);
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (/github\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchGithubRepoHomepageUrl(
  fullName: string,
): Promise<string | null> {
  if (
    readEnv(
      "TRENDINGREPO_GITHUB_HOMEPAGE_LOOKUP",
      "STARSCREENER_GITHUB_HOMEPAGE_LOOKUP",
    ) === "false"
  ) {
    return null;
  }

  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return null;
  }

  const result = await githubFetch(`/repos/${owner}/${name}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    cache: "default",
  });
  if (!result || !result.response.ok) return null;

  try {
    const raw = (await result.response.json()) as RawGithubRepoResponse;
    return cleanHomepage(raw.homepage);
  } catch {
    return null;
  }
}
