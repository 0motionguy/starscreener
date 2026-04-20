// StarScreener — GitHub REST adapter for the Compare page.
//
// Fetches a rich, per-repo bundle straight from the GitHub API for use by
// `/api/compare`. This is intentionally independent of the in-process
// pipeline: the Compare page wants live, high-fidelity data (commit heatmap,
// language split, contributors, PR/issue velocity, releases) that we do not
// currently precompute.
//
// Public surface: `CompareRepoBundle`, `fetchCompareBundle`,
// `fetchCompareBundles`. Sibling agents consume the type from this module —
// do not change field names/shapes without coordinating.

const GITHUB_API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface CompareRepoBundle {
  fullName: string;
  ok: boolean;
  error?: string;
  // identity
  owner: string;
  name: string;
  avatarUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  language: string | null;
  license: string | null; // SPDX id or null
  defaultBranch: string;
  createdAt: string; // ISO
  pushedAt: string; // ISO
  // counts
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  subscribers: number;
  // activity
  commitActivity: Array<{
    weekStart: number;
    days: [number, number, number, number, number, number, number];
  }>; // 52 weeks, weekStart=unix seconds (start of week), days[0..6]=Sun..Sat
  languages: Array<{ name: string; bytes: number; percent: number }>;
  contributors: Array<{
    login: string;
    avatarUrl: string;
    contributions: number;
  }>;
  pullsOpen: number;
  pullsMergedRecently: number;
  pullsClosedRecentlyWithoutMerge: number;
  issuesOpen: number;
  issuesClosedRecently: number;
  releases: Array<{ tag: string; name: string; publishedAt: string }>;
  latestRelease: { tag: string; publishedAt: string } | null;
}

// ─── internal types (only what we touch) ──────────────────────────────────

interface GhRepo {
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  topics?: string[];
  language: string | null;
  license: { spdx_id?: string | null } | null;
  default_branch: string;
  created_at: string;
  pushed_at: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  subscribers_count?: number;
  owner: { login: string; avatar_url: string };
}

interface GhCommitActivityWeek {
  total: number;
  week: number;
  days: number[];
}

interface GhContributor {
  login?: string;
  avatar_url?: string;
  contributions: number;
  type?: string;
}

interface GhPull {
  merged_at: string | null;
  closed_at: string | null;
}

interface GhIssue {
  closed_at: string | null;
  pull_request?: unknown;
}

interface GhRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function zeroBundle(fullName: string): CompareRepoBundle {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    fullName,
    ok: false,
    owner,
    name,
    avatarUrl: "",
    description: "",
    homepage: null,
    topics: [],
    language: null,
    license: null,
    defaultBranch: "",
    createdAt: "",
    pushedAt: "",
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    subscribers: 0,
    commitActivity: [],
    languages: [],
    contributors: [],
    pullsOpen: 0,
    pullsMergedRecently: 0,
    pullsClosedRecentlyWithoutMerge: 0,
    issuesOpen: 0,
    issuesClosedRecently: 0,
    releases: [],
    latestRelease: null,
  };
}

function authHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "starscreener-compare",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Fetch with timeout. Never throws on non-2xx — returns the Response so callers
 *  can branch on status (404/403/202 matter here). */
async function ghFetch(
  url: string,
  token: string | undefined,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: authHeaders(token),
      signal: controller.signal,
      // Let Next.js revalidate via the route-level cache header; avoid Next's
      // dedupe cache so concurrent requests don't collide on the same key.
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }
}

/** A class of response we treat as "upstream refused" → propagate so the caller
 *  can short-circuit the bundle (rate-limited / not-found). */
class GhStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function ghJson<T>(
  url: string,
  token: string | undefined,
): Promise<T> {
  const res = await ghFetch(url, token);
  if (res.status === 404) throw new GhStatusError(404, "not_found");
  if (res.status === 403) throw new GhStatusError(403, "rate_limited");
  if (!res.ok) throw new GhStatusError(res.status, `http_${res.status}`);
  return (await res.json()) as T;
}

/** Parse `Link: <...page=7>; rel="last"` for the `last` page number. */
function parseLastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  // Split on "," — each segment is `<url>; rel="xxx"`
  for (const part of link.split(",")) {
    const segment = part.trim();
    if (!/rel="last"/.test(segment)) continue;
    const urlMatch = segment.match(/<([^>]+)>/);
    if (!urlMatch) continue;
    try {
      const u = new URL(urlMatch[1]);
      const p = u.searchParams.get("page");
      if (p) {
        const n = Number(p);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch {
      // fallthrough
    }
  }
  return null;
}

// ─── per-endpoint fetchers ────────────────────────────────────────────────

async function fetchRepo(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<GhRepo> {
  return ghJson<GhRepo>(`${GITHUB_API}/repos/${owner}/${name}`, token);
}

/** Commit activity endpoint: can return 202 while GitHub builds stats.
 *  We retry once after 2s; if still pending, return []. */
async function fetchCommitActivity(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<CompareRepoBundle["commitActivity"]> {
  const url = `${GITHUB_API}/repos/${owner}/${name}/stats/commit_activity`;
  let res = await ghFetch(url, token);
  if (res.status === 202) {
    await new Promise((r) => setTimeout(r, 2_000));
    res = await ghFetch(url, token);
  }
  if (res.status === 202) return [];
  if (res.status === 404) throw new GhStatusError(404, "not_found");
  if (res.status === 403) throw new GhStatusError(403, "rate_limited");
  if (!res.ok) return [];
  // 204 (no content) for brand-new/empty repos.
  if (res.status === 204) return [];
  const text = await res.text();
  if (!text) return [];
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(body)) return [];
  const weeks = body as GhCommitActivityWeek[];
  return weeks.map((w) => {
    const d = Array.isArray(w.days) ? w.days : [];
    const days: [number, number, number, number, number, number, number] = [
      Number(d[0] ?? 0),
      Number(d[1] ?? 0),
      Number(d[2] ?? 0),
      Number(d[3] ?? 0),
      Number(d[4] ?? 0),
      Number(d[5] ?? 0),
      Number(d[6] ?? 0),
    ];
    return { weekStart: Number(w.week ?? 0), days };
  });
}

async function fetchLanguages(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<CompareRepoBundle["languages"]> {
  const map = await ghJson<Record<string, number>>(
    `${GITHUB_API}/repos/${owner}/${name}/languages`,
    token,
  );
  const entries = Object.entries(map ?? {}).filter(
    ([, v]) => typeof v === "number" && v > 0,
  );
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  return entries
    .map(([langName, bytes]) => ({
      name: langName,
      bytes,
      percent: total > 0 ? (bytes / total) * 100 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

async function fetchContributors(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<CompareRepoBundle["contributors"]> {
  // `anon=0` (default) excludes anonymous; explicit for clarity.
  const res = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${name}/contributors?per_page=20&anon=0`,
    token,
  );
  // 204 when a repo has no contributors yet (e.g., only auto-generated commits).
  if (res.status === 204) return [];
  if (res.status === 404) throw new GhStatusError(404, "not_found");
  if (res.status === 403) throw new GhStatusError(403, "rate_limited");
  if (!res.ok) return [];
  const body = (await res.json()) as GhContributor[];
  if (!Array.isArray(body)) return [];
  return body.slice(0, 20).map((c) => ({
    login: c.login ?? "",
    avatarUrl: c.avatar_url ?? "",
    contributions: Number(c.contributions ?? 0),
  }));
}

async function fetchPullsOpenCount(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<number> {
  const res = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${name}/pulls?state=open&per_page=1`,
    token,
  );
  if (res.status === 404) throw new GhStatusError(404, "not_found");
  if (res.status === 403) throw new GhStatusError(403, "rate_limited");
  if (!res.ok) return 0;
  const link = res.headers.get("Link");
  const last = parseLastPageFromLink(link);
  if (last != null) return last;
  const body = (await res.json()) as unknown[];
  return Array.isArray(body) ? body.length : 0;
}

async function fetchRecentClosedPulls(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<{ merged: number; closedNotMerged: number }> {
  // Closed PRs are sorted by `created` by default; switch to updated desc so the
  // first page is more likely to contain the recent churn we care about.
  const body = await ghJson<GhPull[]>(
    `${GITHUB_API}/repos/${owner}/${name}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
    token,
  );
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let merged = 0;
  let closedNotMerged = 0;
  for (const p of body) {
    const closedAt = p.closed_at ? Date.parse(p.closed_at) : NaN;
    if (!Number.isFinite(closedAt) || closedAt < cutoff) continue;
    if (p.merged_at) merged++;
    else closedNotMerged++;
  }
  return { merged, closedNotMerged };
}

async function fetchRecentClosedIssues(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<number> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const body = await ghJson<GhIssue[]>(
    `${GITHUB_API}/repos/${owner}/${name}/issues?state=closed&since=${encodeURIComponent(since)}&per_page=100`,
    token,
  );
  // The issues endpoint returns PRs too — filter them out via `pull_request`.
  let count = 0;
  for (const i of body) {
    if (i.pull_request) continue;
    count++;
  }
  return count;
}

async function fetchReleases(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<{
  releases: CompareRepoBundle["releases"];
  latest: CompareRepoBundle["latestRelease"];
}> {
  const body = await ghJson<GhRelease[]>(
    `${GITHUB_API}/repos/${owner}/${name}/releases?per_page=10`,
    token,
  );
  const releases = body.map((r) => ({
    tag: r.tag_name ?? "",
    name: r.name ?? r.tag_name ?? "",
    publishedAt: r.published_at ?? "",
  }));
  const latest =
    releases.length > 0
      ? { tag: releases[0].tag, publishedAt: releases[0].publishedAt }
      : null;
  return { releases, latest };
}

// ─── public API ───────────────────────────────────────────────────────────

export async function fetchCompareBundle(
  fullName: string,
  opts?: { token?: string },
): Promise<CompareRepoBundle> {
  const started = Date.now();
  const token = opts?.token ?? process.env.GITHUB_TOKEN;

  const slashIdx = fullName.indexOf("/");
  if (slashIdx <= 0 || slashIdx === fullName.length - 1) {
    const b = zeroBundle(fullName);
    b.error = "invalid_name";
    console.log(
      JSON.stringify({
        scope: "compare:fetch",
        fullName,
        ok: false,
        error: "invalid_name",
        ms: Date.now() - started,
      }),
    );
    return b;
  }
  const owner = fullName.slice(0, slashIdx);
  const name = fullName.slice(slashIdx + 1);

  try {
    // Fetch the repo first — we need the owner avatar + canonical fields, and
    // 404 / 403 here means we can bail cheaply without issuing 7 more calls.
    const repo = await fetchRepo(owner, name, token);

    const [
      commitActivityRes,
      languagesRes,
      contributorsRes,
      pullsOpenRes,
      pullsClosedRes,
      issuesClosedRes,
      releasesRes,
    ] = await Promise.all([
      withDefault(fetchCommitActivity(owner, name, token), []),
      withDefault(fetchLanguages(owner, name, token), []),
      withDefault(fetchContributors(owner, name, token), []),
      withDefault(fetchPullsOpenCount(owner, name, token), 0),
      withDefault(fetchRecentClosedPulls(owner, name, token), {
        merged: 0,
        closedNotMerged: 0,
      }),
      withDefault(fetchRecentClosedIssues(owner, name, token), 0),
      withDefault(fetchReleases(owner, name, token), {
        releases: [],
        latest: null,
      }),
    ]);

    const bundle: CompareRepoBundle = {
      fullName: repo.full_name ?? fullName,
      ok: true,
      owner: repo.owner?.login ?? owner,
      name: repo.name ?? name,
      avatarUrl: repo.owner?.avatar_url ?? "",
      description: repo.description ?? "",
      homepage: repo.homepage && repo.homepage.length > 0 ? repo.homepage : null,
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      language: repo.language ?? null,
      license: repo.license?.spdx_id ?? null,
      defaultBranch: repo.default_branch ?? "",
      createdAt: repo.created_at ?? "",
      pushedAt: repo.pushed_at ?? "",
      stars: Number(repo.stargazers_count ?? 0),
      forks: Number(repo.forks_count ?? 0),
      watchers: Number(repo.watchers_count ?? 0),
      openIssues: Number(repo.open_issues_count ?? 0),
      subscribers: Number(repo.subscribers_count ?? 0),
      commitActivity: commitActivityRes,
      languages: languagesRes,
      contributors: contributorsRes,
      pullsOpen: pullsOpenRes,
      pullsMergedRecently: pullsClosedRes.merged,
      pullsClosedRecentlyWithoutMerge: pullsClosedRes.closedNotMerged,
      issuesOpen: Number(repo.open_issues_count ?? 0),
      issuesClosedRecently: issuesClosedRes,
      releases: releasesRes.releases,
      latestRelease: releasesRes.latest,
    };

    console.log(
      JSON.stringify({
        scope: "compare:fetch",
        fullName,
        ok: true,
        ms: Date.now() - started,
        stars: bundle.stars,
        commitWeeks: bundle.commitActivity.length,
        languages: bundle.languages.length,
        contributors: bundle.contributors.length,
        pullsOpen: bundle.pullsOpen,
        releases: bundle.releases.length,
      }),
    );
    return bundle;
  } catch (err) {
    const ms = Date.now() - started;
    let errorCode = "upstream_error";
    if (err instanceof GhStatusError) {
      if (err.status === 404) errorCode = "not_found";
      else if (err.status === 403) errorCode = "rate_limited";
      else errorCode = `http_${err.status}`;
    } else if ((err as { name?: string })?.name === "AbortError") {
      errorCode = "timeout";
    }
    const b = zeroBundle(fullName);
    b.error = errorCode;
    console.log(
      JSON.stringify({ scope: "compare:fetch", fullName, ok: false, ms, error: errorCode }),
    );
    return b;
  }
}

/** If the inner fetch resolves, forward its value; if it rejects with a
 *  GhStatusError (rate_limited / not_found), re-throw so the whole bundle
 *  collapses to `ok:false`; otherwise swallow the error and return the typed
 *  default so a single flaky sub-endpoint does not take down the bundle. */
async function withDefault<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof GhStatusError) throw err;
    return fallback;
  }
}

export async function fetchCompareBundles(
  fullNames: string[],
  opts?: { token?: string },
): Promise<CompareRepoBundle[]> {
  const token = opts?.token ?? process.env.GITHUB_TOKEN;
  // Use allSettled defensively — `fetchCompareBundle` already converts errors
  // into `ok:false` bundles, but allSettled guarantees the batch completes
  // even if a surprise throws past that guard.
  const settled = await Promise.allSettled(
    fullNames.map((fn) => fetchCompareBundle(fn, { token })),
  );
  return settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const b = zeroBundle(fullNames[i]);
    b.error = "upstream_error";
    return b;
  });
}
