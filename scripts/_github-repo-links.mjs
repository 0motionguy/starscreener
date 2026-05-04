// Shared GitHub repo-link parsing for source scrapers.
//
// Keep all github.com/<owner>/<repo> URL normalization here so source
// scrapers do not drift on .git suffixes, trailing punctuation, or reserved
// GitHub paths like /orgs and /settings.

export const RESERVED_GITHUB_OWNERS = new Set([
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
const GITHUB_REPO_URL_RE =
  /(?:^|[^A-Za-z0-9_.-])(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/gi;

export function normalizeGithubFullName(owner, name) {
  let clean = `${owner}/${name}`.toLowerCase();
  let prev;
  do {
    prev = clean;
    clean = clean.replace(TRAILING_REPO_PUNCTUATION_RE, "");
    clean = clean.replace(/\.git$/i, "");
  } while (clean !== prev);
  return clean;
}

export function isReservedGithubOwner(owner) {
  return RESERVED_GITHUB_OWNERS.has(String(owner ?? "").toLowerCase());
}

function isTrackedFullName(trackedLower, fullName) {
  return !trackedLower || trackedLower.has(fullName);
}

export function githubFullNameToUrl(fullName) {
  const normalized = String(fullName ?? "").trim().toLowerCase();
  const segments = normalized.split("/");
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null;
  return `https://github.com/${normalized}`;
}

export function extractGithubRepoFullNames(text, trackedLower = null) {
  const hits = new Set();
  if (!text || typeof text !== "string") return hits;

  GITHUB_REPO_URL_RE.lastIndex = 0;
  let match;
  while ((match = GITHUB_REPO_URL_RE.exec(text)) !== null) {
    const fullName = normalizeGithubFullName(match[1], match[2]);
    const [owner, repo] = fullName.split("/", 2);
    if (!owner || !repo || isReservedGithubOwner(owner)) continue;
    if (!isTrackedFullName(trackedLower, fullName)) continue;
    hits.add(fullName);
  }
  return hits;
}

export function extractFirstGithubRepoLink(text) {
  const hits = extractGithubRepoFullNames(text);
  const fullName = hits.values().next().value ?? null;
  if (!fullName) return null;
  return {
    fullName,
    url: githubFullNameToUrl(fullName),
  };
}

// Bare `owner/repo` token — no `github.com/` prefix. Used to recover
// mentions in social text that drops the host (tweets, Bluesky posts,
// HN comments). Lookbehind/-ahead keep it from biting URL fragments
// like `https://github.com/openai/whisper/blob/main` or filesystem
// paths like `path/to/file`. The tracked-set membership check is the
// safety net that makes this safe — we never emit a name we don't
// already know about, so false positives are impossible.
const BARE_REPO_TOKEN_RE =
  /(?<![A-Za-z0-9._\/-])([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)(?![A-Za-z0-9._\/-])/g;

export function extractTrackedBareRefs(text, trackedLower) {
  const hits = new Set();
  if (!text || typeof text !== "string") return hits;
  if (!trackedLower || trackedLower.size === 0) return hits;

  BARE_REPO_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = BARE_REPO_TOKEN_RE.exec(text)) !== null) {
    const fullName = normalizeGithubFullName(match[1], match[2]);
    const [owner, repo] = fullName.split("/", 2);
    if (!owner || !repo || isReservedGithubOwner(owner)) continue;
    if (!trackedLower.has(fullName)) continue;
    hits.add(fullName);
  }
  return hits;
}

export function normalizeGithubRepoUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  let parsed;
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
