#!/usr/bin/env node
// Scrape top npm package download telemetry.
//
// npm has public no-auth per-package download APIs and a public registry
// search endpoint, but it does NOT expose a true global "top npm packages"
// feed. So this job does the honest version:
//   1. Discover candidates from npm registry search queries.
//   2. Keep only packages whose npm metadata links to a GitHub repo.
//   3. Fetch bulk point download counts for last-day/week/month.
//   4. Rank the repo-linked packages for 24h, 7d, and 30d views.
//
// Output:
//   - data/npm-packages.json
//
// Cadence: daily. npm download stats lag by roughly 24-48h.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry, HttpStatusError, sleep } from "./_fetch-json.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT = resolve(DATA_DIR, "npm-packages.json");

export const WINDOWS = ["24h", "7d", "30d"];

export const DEFAULT_NPM_DISCOVERY_QUERIES = [
  "ai",
  "llm",
  "agent",
  "mcp",
  "rag",
  "openai",
  "anthropic",
  "claude",
  "ollama",
  "embedding",
  "react",
  "next",
  "vite",
  "cli",
];

const DOWNLOAD_PERIODS = {
  "24h": "last-day",
  "7d": "last-week",
  "30d": "last-month",
};
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const SEARCH_SIZE = Math.max(
  1,
  Math.min(100, Number.parseInt(process.env.NPM_SEARCH_SIZE ?? "10", 10) || 10),
);
const CANDIDATE_LIMIT = Math.max(
  1,
  Math.min(250, Number.parseInt(process.env.NPM_CANDIDATE_LIMIT ?? "80", 10) || 80),
);
const TOP_LIMIT = Math.max(
  1,
  Math.min(250, Number.parseInt(process.env.NPM_TOP_LIMIT ?? "75", 10) || 75),
);
const DOWNLOAD_BULK_SIZE = Math.max(
  1,
  Math.min(128, Number.parseInt(process.env.NPM_DOWNLOAD_BULK_SIZE ?? "100", 10) || 100),
);
const SEARCH_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.NPM_SEARCH_DELAY_MS ?? "750", 10) || 0,
);
const SCOPED_DOWNLOAD_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.NPM_SCOPED_DOWNLOAD_DELAY_MS ?? "250", 10) || 0,
);

export function parseDiscoveryQueries(raw) {
  const source =
    typeof raw === "string" && raw.trim().length > 0
      ? raw.split(/[,\n]/)
      : DEFAULT_NPM_DISCOVERY_QUERIES;

  const seen = new Set();
  const out = [];
  for (const entry of source) {
    const query = String(entry ?? "").trim();
    if (query.length < 2) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  return out;
}

export function encodePackageName(name) {
  return encodeURIComponent(String(name));
}

export function npmPackageUrl(name) {
  return `https://www.npmjs.com/package/${String(name)}`;
}

export function normalizeRepositoryUrl(repository) {
  const raw =
    typeof repository === "string"
      ? repository
      : typeof repository?.url === "string"
        ? repository.url
        : "";

  if (!raw) return null;

  let url = raw.trim();
  url = url.replace(/^git\+/, "");
  url = url.replace(/^git:\/\//, "https://");
  url = url.replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/");
  url = url.replace(/^git@github\.com:/i, "https://github.com/");
  url = url.replace(/\.git(#.*)?$/i, "");
  url = url.replace(/#.*$/, "");
  url = url.replace(/\/+$/, "");

  if (/^github\.com\//i.test(url)) url = `https://${url}`;
  return url || null;
}

export function extractGithubRepoFullName(url) {
  if (!url) return null;
  const match = String(url).match(
    /github\.com[:/]([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/i,
  );
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  return `${owner}/${repo}`;
}

function sumDownloads(days) {
  return days.reduce(
    (sum, day) => sum + Math.max(0, Number(day.downloads) || 0),
    0,
  );
}

export function computeDownloadStats(downloads) {
  const days = Array.isArray(downloads) ? downloads.slice() : [];
  const downloads24h =
    days.length > 0 ? Math.max(0, Number(days.at(-1)?.downloads) || 0) : 0;
  const previous24h =
    days.length > 1 ? Math.max(0, Number(days.at(-2)?.downloads) || 0) : 0;
  const downloads7d = sumDownloads(days.slice(-7));
  const previous7d = sumDownloads(days.slice(-14, -7));
  const downloads30d = sumDownloads(days.slice(-30));

  const delta24h = downloads24h - previous24h;
  const delta7d = downloads7d - previous7d;
  const deltaPct24h =
    previous24h > 0
      ? (delta24h / previous24h) * 100
      : downloads24h > 0
        ? 100
        : 0;
  const deltaPct7d =
    previous7d > 0
      ? (delta7d / previous7d) * 100
      : downloads7d > 0
        ? 100
        : 0;

  return {
    downloads24h,
    previous24h,
    delta24h,
    deltaPct24h: Math.round(deltaPct24h * 10) / 10,
    downloads7d,
    previous7d,
    delta7d,
    deltaPct7d: Math.round(deltaPct7d * 10) / 10,
    downloads30d,
    trendScore24h: computeTrendScore(downloads24h, delta24h, downloads30d),
    trendScore7d: computeTrendScore(downloads7d, delta7d, downloads30d),
    trendScore30d: downloads30d,
  };
}

export function computePointStats({ downloads24h = 0, downloads7d = 0, downloads30d = 0 }) {
  return {
    downloads24h,
    previous24h: 0,
    delta24h: 0,
    deltaPct24h: 0,
    downloads7d,
    previous7d: 0,
    delta7d: 0,
    deltaPct7d: 0,
    downloads30d,
    trendScore24h: downloads24h,
    trendScore7d: downloads7d,
    trendScore30d: downloads30d,
  };
}

function computeTrendScore(downloads, delta, downloads30d) {
  return Math.round(
    (downloads + Math.max(0, delta) * 2) *
      Math.max(1, Math.log10(downloads30d + 10)),
  );
}

export function metricForWindow(row, window) {
  if (window === "24h") return row.trendScore24h ?? 0;
  if (window === "7d") return row.trendScore7d ?? 0;
  return row.trendScore30d ?? 0;
}

export function sortByWindow(rows, window) {
  return rows.slice().sort((a, b) => {
    const byMetric = metricForWindow(b, window) - metricForWindow(a, window);
    if (byMetric !== 0) return byMetric;
    const byDownloads = (b.downloads30d ?? 0) - (a.downloads30d ?? 0);
    if (byDownloads !== 0) return byDownloads;
    return a.name.localeCompare(b.name);
  });
}

export function normalizeSearchObject(object, query) {
  const pkg = object?.package;
  const name = typeof pkg?.name === "string" ? pkg.name : "";
  if (!name) return null;

  const repositoryUrl = normalizeRepositoryUrl(pkg.links?.repository);
  const linkedRepo = extractGithubRepoFullName(repositoryUrl);
  if (!linkedRepo) return null;

  return {
    name,
    npmUrl: typeof pkg.links?.npm === "string" ? pkg.links.npm : npmPackageUrl(name),
    description: typeof pkg.description === "string" ? pkg.description : null,
    latestVersion: typeof pkg.version === "string" ? pkg.version : null,
    publishedAt: typeof pkg.date === "string" ? pkg.date : null,
    repositoryUrl,
    linkedRepo,
    homepage: typeof pkg.links?.homepage === "string" ? pkg.links.homepage : null,
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter(Boolean).slice(0, 12) : [],
    discovery: {
      queries: [query],
      searchScore: Number(object?.searchScore) || 0,
      finalScore: Number(object?.score?.final) || 0,
      weeklyDownloads: Math.max(0, Number(object?.downloads?.weekly) || 0),
      monthlyDownloads: Math.max(0, Number(object?.downloads?.monthly) || 0),
    },
  };
}

function mergeCandidate(existing, next) {
  if (!existing) return next;
  const queries = new Set([
    ...(existing.discovery?.queries ?? []),
    ...(next.discovery?.queries ?? []),
  ]);
  return {
    ...existing,
    description: existing.description ?? next.description,
    latestVersion: existing.latestVersion ?? next.latestVersion,
    publishedAt: existing.publishedAt ?? next.publishedAt,
    repositoryUrl: existing.repositoryUrl ?? next.repositoryUrl,
    linkedRepo: existing.linkedRepo ?? next.linkedRepo,
    homepage: existing.homepage ?? next.homepage,
    keywords: Array.from(new Set([...(existing.keywords ?? []), ...(next.keywords ?? [])])).slice(0, 12),
    discovery: {
      queries: Array.from(queries),
      searchScore: Math.max(existing.discovery?.searchScore ?? 0, next.discovery?.searchScore ?? 0),
      finalScore: Math.max(existing.discovery?.finalScore ?? 0, next.discovery?.finalScore ?? 0),
      weeklyDownloads: Math.max(
        existing.discovery?.weeklyDownloads ?? 0,
        next.discovery?.weeklyDownloads ?? 0,
      ),
      monthlyDownloads: Math.max(
        existing.discovery?.monthlyDownloads ?? 0,
        next.discovery?.monthlyDownloads ?? 0,
      ),
    },
  };
}

async function fetchSearchResults(query, fetchImpl = fetch) {
  const url = new URL("https://registry.npmjs.org/-/v1/search");
  url.searchParams.set("text", query);
  url.searchParams.set("size", String(SEARCH_SIZE));
  url.searchParams.set("from", "0");
  url.searchParams.set("quality", "0.2");
  url.searchParams.set("popularity", "0.6");
  url.searchParams.set("maintenance", "0.2");

  return fetchJsonWithRetry(url.toString(), {
    fetchImpl,
    attempts: 2,
    timeoutMs: 20_000,
    headers: { "User-Agent": USER_AGENT },
  });
}

export async function discoverCandidates({ queries, fetchImpl = fetch, log = () => {} }) {
  const byName = new Map();
  const failures = [];

  for (const query of queries) {
    try {
      const payload = await fetchSearchResults(query, fetchImpl);
      const objects = Array.isArray(payload?.objects) ? payload.objects : [];
      let linked = 0;
      for (const object of objects) {
        const candidate = normalizeSearchObject(object, query);
        if (!candidate) continue;
        linked += 1;
        const key = candidate.name.toLowerCase();
        byName.set(key, mergeCandidate(byName.get(key), candidate));
      }
      log(`  search "${query}" -> ${objects.length} candidates, ${linked} repo-linked`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ query, error: message });
      log(`  search "${query}" failed: ${message}`);
    }
    if (SEARCH_DELAY_MS > 0) await sleep(SEARCH_DELAY_MS);
  }

  return {
    candidates: Array.from(byName.values()).sort((a, b) =>
      b.discovery.finalScore - a.discovery.finalScore || a.name.localeCompare(b.name),
    ),
    failures,
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

function normalizePointPayload(payload) {
  const map = new Map();
  if (typeof payload?.package === "string") {
    map.set(payload.package.toLowerCase(), Math.max(0, Number(payload.downloads) || 0));
    return map;
  }

  for (const [name, value] of Object.entries(payload ?? {})) {
    map.set(name.toLowerCase(), Math.max(0, Number(value?.downloads) || 0));
  }
  return map;
}

async function fetchBulkDownloadPoints(names, period, fetchImpl = fetch) {
  const encodedNames = names.map(encodePackageName).join(",");
  const url = `https://api.npmjs.org/downloads/point/${period}/${encodedNames}`;
  try {
    const payload = await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 4,
      retryDelayMs: 5_000,
      timeoutMs: 30_000,
      headers: { "User-Agent": USER_AGENT },
    });
    return normalizePointPayload(payload);
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return new Map();
    throw err;
  }
}

async function fetchSingleDownloadPoint(name, period, fetchImpl = fetch) {
  const url = `https://api.npmjs.org/downloads/point/${period}/${encodePackageName(name)}`;
  try {
    const payload = await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 3,
      retryDelayMs: 5_000,
      timeoutMs: 30_000,
      headers: { "User-Agent": USER_AGENT },
    });
    return Math.max(0, Number(payload?.downloads) || 0);
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return 0;
    throw err;
  }
}

export async function fetchDownloadMatrix(candidates, { fetchImpl = fetch, log = () => {} } = {}) {
  const period = DOWNLOAD_PERIODS["24h"];
  const matrix = new Map(
    candidates.map((candidate) => [
      candidate.name.toLowerCase(),
      {
        downloads24h: 0,
        downloads7d: Math.max(0, Number(candidate.discovery?.weeklyDownloads) || 0),
        downloads30d: Math.max(0, Number(candidate.discovery?.monthlyDownloads) || 0),
      },
    ]),
  );
  const names = candidates.map((candidate) => candidate.name);

  const unscoped = names.filter((name) => !name.startsWith("@"));
  const scoped = names.filter((name) => name.startsWith("@"));

  let fetched = 0;
  for (const group of chunk(unscoped, DOWNLOAD_BULK_SIZE)) {
    try {
      const points = await fetchBulkDownloadPoints(group, period, fetchImpl);
      for (const name of group) {
        const row = matrix.get(name.toLowerCase());
        if (!row) continue;
        const value = points.get(name.toLowerCase()) ?? 0;
        row.downloads24h = value;
        fetched += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  downloads ${period} bulk failed for ${group.length} packages: ${message}`);
    }
  }

  for (const name of scoped) {
    try {
      const row = matrix.get(name.toLowerCase());
      if (row) row.downloads24h = await fetchSingleDownloadPoint(name, period, fetchImpl);
      fetched += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  downloads ${period} failed for ${name}: ${message}`);
    }
    if (SCOPED_DOWNLOAD_DELAY_MS > 0) await sleep(SCOPED_DOWNLOAD_DELAY_MS);
  }

  log(
    `  downloads ${period} -> ${fetched} packages ` +
      `(${unscoped.length} bulk-safe, ${scoped.length} scoped singles)`,
  );
  return matrix;
}

export async function main({ log = console.log, fetchImpl = fetch } = {}) {
  const fetchedAt = new Date().toISOString();
  const queries = parseDiscoveryQueries(process.env.NPM_DISCOVERY_QUERIES);

  log(
    `discovering npm packages with GitHub repos ` +
      `(${queries.length} queries x ${SEARCH_SIZE} results)`,
  );
  const { candidates, failures } = await discoverCandidates({
    queries,
    fetchImpl,
    log,
  });

  const candidatesForDownloads = candidates
    .slice()
    .sort((a, b) => {
      const byMonthly =
        (b.discovery?.monthlyDownloads ?? 0) - (a.discovery?.monthlyDownloads ?? 0);
      if (byMonthly !== 0) return byMonthly;
      return (b.discovery?.finalScore ?? 0) - (a.discovery?.finalScore ?? 0);
    })
    .slice(0, CANDIDATE_LIMIT);

  log(
    `fetching bulk download points for ${candidatesForDownloads.length} ` +
      `of ${candidates.length} repo-linked candidates`,
  );
  let matrix;
  try {
    matrix = await fetchDownloadMatrix(candidatesForDownloads, { fetchImpl, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ package: "*bulk-downloads*", error: message });
    throw err;
  }

  const hydrated = candidatesForDownloads
    .map((candidate) => {
      const points = matrix.get(candidate.name.toLowerCase());
      const stats = computePointStats(points ?? {});
      return {
        ...candidate,
        status: "ok",
        downloads: [],
        ...stats,
        error: null,
      };
    })
    .filter((row) => row.downloads30d > 0);

  const topNameSet = new Set();
  for (const window of WINDOWS) {
    for (const row of sortByWindow(hydrated, window).slice(0, TOP_LIMIT)) {
      topNameSet.add(row.name.toLowerCase());
    }
  }
  const rows = sortByWindow(
    hydrated.filter((row) => topNameSet.has(row.name.toLowerCase())),
    "24h",
  );
  const top = Object.fromEntries(
    WINDOWS.map((window) => [
      window,
      sortByWindow(rows, window)
        .slice(0, TOP_LIMIT)
        .map((row) => row.name),
    ]),
  );

  const payload = {
    fetchedAt,
    source: "npm",
    sourceUrl: "https://api.npmjs.org/downloads/",
    registrySearchUrl: "https://registry.npmjs.org/-/v1/search",
    windowDays: 30,
    windows: WINDOWS,
    activeWindowDefault: "24h",
    downloadRange: "point:last-day,last-week,last-month",
    lagHint: "npm public download stats usually lag by 24-48 hours",
    discovery: {
      mode: "registry-search-with-github-repo-filter",
      searchSize: SEARCH_SIZE,
      topLimit: TOP_LIMIT,
      candidateLimit: CANDIDATE_LIMIT,
      downloadBulkSize: DOWNLOAD_BULK_SIZE,
      queries,
      candidatesFound: candidates.length,
      failures,
    },
    counts: {
      total: rows.length,
      ok: rows.length,
      missing: 0,
      error: failures.filter((f) => f.package).length,
      linkedRepos: rows.filter((row) => row.linkedRepo).length,
    },
    top,
    packages: rows,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  log(`wrote ${OUT} (${rows.length} top repo-linked npm packages)`);
  return payload;
}

const argv1 = process.argv[1];
const isDirectRun =
  Boolean(argv1) &&
  (import.meta.url === `file://${argv1}` ||
    import.meta.url.endsWith(argv1.replace(/\\/g, "/")));

if (isDirectRun) {
  main().catch((err) => {
    console.error("scrape-npm failed:", err.message ?? err);
    process.exit(1);
  });
}
