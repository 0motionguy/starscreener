// Shared GitHub repo-link parsing for source fetchers.
//
// Mirrors scripts/_github-repo-links.mjs. Keep all
// github.com/<owner>/<repo> URL normalization here so source fetchers do not
// drift on .git suffixes, trailing punctuation, or reserved GitHub paths
// like /orgs and /settings.

export const RESERVED_GITHUB_OWNERS = new Set<string>([
  'orgs',
  'settings',
  'about',
  'features',
  'pricing',
  'marketplace',
  'collections',
  'trending',
  'topics',
  'search',
  'login',
  'join',
  'sponsors',
  'enterprise',
  'customer-stories',
  'readme',
  'apps',
  'notifications',
]);

const TRAILING_REPO_PUNCTUATION_RE = /[.,;:!?)\]}]+$/;
const GITHUB_REPO_URL_RE =
  /(?:^|[^A-Za-z0-9_.-])(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/gi;

export function normalizeGithubFullName(owner: string, name: string): string {
  let clean = `${owner}/${name}`.toLowerCase();
  let prev: string;
  do {
    prev = clean;
    clean = clean.replace(TRAILING_REPO_PUNCTUATION_RE, '');
    clean = clean.replace(/\.git$/i, '');
  } while (clean !== prev);
  return clean;
}

export function isReservedGithubOwner(owner: string): boolean {
  return RESERVED_GITHUB_OWNERS.has(String(owner ?? '').toLowerCase());
}

type TrackedSet = Set<string> | Map<string, string> | null | undefined;

function isTrackedFullName(tracked: TrackedSet, fullName: string): boolean {
  if (!tracked) return true;
  if (tracked instanceof Map) return tracked.has(fullName);
  return tracked.has(fullName);
}

export function githubFullNameToUrl(fullName: string): string | null {
  const normalized = String(fullName ?? '').trim().toLowerCase();
  const segments = normalized.split('/');
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null;
  return `https://github.com/${normalized}`;
}

export function extractGithubRepoFullNames(text: string, tracked: TrackedSet = null): Set<string> {
  const hits = new Set<string>();
  if (!text || typeof text !== 'string') return hits;

  GITHUB_REPO_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GITHUB_REPO_URL_RE.exec(text)) !== null) {
    const ownerRaw = match[1];
    const repoRaw = match[2];
    if (!ownerRaw || !repoRaw) continue;
    const fullName = normalizeGithubFullName(ownerRaw, repoRaw);
    const [owner, repo] = fullName.split('/', 2);
    if (!owner || !repo || isReservedGithubOwner(owner)) continue;
    if (!isTrackedFullName(tracked, fullName)) continue;
    hits.add(fullName);
  }
  return hits;
}

export interface FirstGithubRepoLink {
  fullName: string;
  url: string | null;
}

export function extractFirstGithubRepoLink(text: string): FirstGithubRepoLink | null {
  const hits = extractGithubRepoFullNames(text);
  const fullName = hits.values().next().value ?? null;
  if (!fullName) return null;
  return {
    fullName,
    url: githubFullNameToUrl(fullName),
  };
}

export function normalizeGithubRepoUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;

  const segments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const ownerRaw = segments[0];
  const repoRaw = segments[1];
  if (!ownerRaw || !repoRaw) return null;
  const fullName = normalizeGithubFullName(ownerRaw, repoRaw);
  const [owner, repo] = fullName.split('/', 2);
  if (!owner || !repo || isReservedGithubOwner(owner)) return null;
  return githubFullNameToUrl(fullName);
}
