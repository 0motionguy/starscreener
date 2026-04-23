// Lightweight GitHub repo homepage resolver for repo detail enrichment.
//
// The committed repo-metadata snapshot now supports homepageUrl, but older
// snapshots do not contain it. This fallback lets website/AISO enrichment work
// immediately while still returning null on API errors or rate limits.

const GITHUB_API = "https://api.github.com";
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
  if (process.env.STARSCREENER_GITHUB_HOMEPAGE_LOOKUP === "false") {
    return null;
  }

  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return null;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}/repos/${owner}/${name}`, {
      headers,
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const raw = (await response.json()) as RawGithubRepoResponse;
    return cleanHomepage(raw.homepage);
  } catch {
    return null;
  }
}
