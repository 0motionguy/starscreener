// Shared GitHub repo-link parsing for source scrapers (TS port).
//
// Keep all github.com/<owner>/<repo> URL normalization here so source
// scrapers do not drift on .git suffixes, trailing punctuation, or reserved
// GitHub paths like /orgs and /settings.
//
// This is the client-safe TypeScript port of scripts/_github-repo-links.mjs.
// Scripts (Node-only collectors) keep importing the .mjs version; the app
// (Next.js + RSC) imports this one. Two copies are intentional during the
// ESM-import-from-TS transition; the regex/reserved set is the source of
// truth here once collectors migrate.

export const RESERVED_GITHUB_OWNERS: Set<string> = new Set([
  "orgs",
  "settings",
  "about",
  "features",
  "pricing",
  "marketplace",
  "collections",
  "trending",
  "topics",
  "search",
  "login",
  "join",
  "sponsors",
  "enterprise",
  "customer-stories",
  "readme",
  "apps",
  "notifications",
]);

const TRAILING_REPO_PUNCTUATION_RE = /[.,;:!?)\]}]+$/;
export const GITHUB_REPO_URL_RE =
  /(?:^|[^A-Za-z0-9_.-])(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/gi;

export function normalizeGithubFullName(owner: string, name: string): string {
  let clean = `${owner}/${name}`.toLowerCase();
  let prev: string;
  do {
    prev = clean;
    clean = clean.replace(TRAILING_REPO_PUNCTUATION_RE, "");
    clean = clean.replace(/\.git$/i, "");
  } while (clean !== prev);
  return clean;
}

export function isReservedGithubOwner(owner: string | null | undefined): boolean {
  return RESERVED_GITHUB_OWNERS.has(String(owner ?? "").toLowerCase());
}

function isTrackedFullName(
  trackedLower: Set<string> | Map<string, string> | null,
  fullName: string,
): boolean {
  return !trackedLower || trackedLower.has(fullName);
}

export function githubFullNameToUrl(fullName: string | null | undefined): string | null {
  const normalized = String(fullName ?? "").trim().toLowerCase();
  const segments = normalized.split("/");
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null;
  return `https://github.com/${normalized}`;
}

export function extractGithubRepoFullNames(
  text: string | null | undefined,
  trackedLower: Set<string> | Map<string, string> | null = null,
): Set<string> {
  const hits = new Set<string>();
  if (!text || typeof text !== "string") return hits;

  GITHUB_REPO_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GITHUB_REPO_URL_RE.exec(text)) !== null) {
    const fullName = normalizeGithubFullName(match[1], match[2]);
    const [owner, repo] = fullName.split("/", 2);
    if (!owner || !repo || isReservedGithubOwner(owner)) continue;
    if (!isTrackedFullName(trackedLower, fullName)) continue;
    hits.add(fullName);
  }
  return hits;
}

export interface FirstGithubRepoLink {
  fullName: string;
  url: string | null;
}

export function extractFirstGithubRepoLink(
  text: string | null | undefined,
): FirstGithubRepoLink | null {
  const hits = extractGithubRepoFullNames(text);
  const fullName = hits.values().next().value ?? null;
  if (!fullName) return null;
  return {
    fullName,
    url: githubFullNameToUrl(fullName),
  };
}

export function normalizeGithubRepoUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const segments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const fullName = normalizeGithubFullName(segments[0], segments[1]);
  const [owner, repo] = fullName.split("/", 2);
  if (!owner || !repo || isReservedGithubOwner(owner)) return null;
  return githubFullNameToUrl(fullName);
}
