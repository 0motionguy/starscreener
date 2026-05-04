#!/usr/bin/env node
// Scrape top npm package download telemetry.
//
// npm has public no-auth per-package download APIs and a public registry
// search endpoint, but it does NOT expose a true global "top npm packages"
// feed. So this job does the honest version:
//   1. Discover candidates from npm registry search queries.
//   2. Keep only packages whose npm metadata links to a GitHub repo.
//   3. Fetch daily download ranges for candidate packages.
//   4. Rank by movement vs the previous equivalent window:
//      - 24h = latest day vs previous day
//      - 7d  = latest 7 days vs previous 7 days
//      - 30d = latest 30 days vs previous 30 days
//
// Output:
//   - data/npm-packages.json
//
// Cadence: daily. npm download stats lag by roughly 24-48h.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import { fetchJsonWithRetry, HttpStatusError, sleep } from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

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

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const SEARCH_SIZE = Math.max(
  1,
  Math.min(100, Number.parseInt(process.env.NPM_SEARCH_SIZE ?? "10", 10) || 10),
);
const CANDIDATE_LIMIT = Math.max(
  1,
  Math.min(250, Number.parseInt(process.env.NPM_CANDIDATE_LIMIT ?? "50", 10) || 50),
);
const TOP_LIMIT = Math.max(
  1,
  Math.min(250, Number.parseInt(process.env.NPM_TOP_LIMIT ?? "75", 10) || 75),
);
const SEARCH_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.NPM_SEARCH_DELAY_MS ?? "750", 10) || 0,
);
const DOWNLOAD_RANGE_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.NPM_DOWNLOAD_RANGE_DELAY_MS ?? "650", 10) || 0,
);
const DOWNLOAD_LAG_DAYS = Math.max(
  1,
  Math.min(7, Number.parseInt(process.env.NPM_DOWNLOAD_LAG_DAYS ?? "2", 10) || 2),
);
const RANGE_DAYS = 60;

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

function pctDelta(current, previous) {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

function roundPct(value) {
  return Math.round(value * 10) / 10;
}

function computeMoverScore(current, previous) {
  const delta = current - previous;
  if (current <= 0 || delta <= 0) return 0;
  const cappedPct = Math.min(500, Math.max(0, pctDelta(current, previous)));
  const volumeWeight = Math.log10(current + 10);
  const deltaWeight = Math.log10(delta + 10);
  return Math.round(cappedPct * volumeWeight + deltaWeight * 25);
}

export function computeDownloadStats(downloads) {
  const days = Array.isArray(downloads)
    ? downloads
        .slice()
        .sort((a, b) => String(a?.day ?? "").localeCompare(String(b?.day ?? "")))
    : [];
  const downloads24h =
    days.length > 0 ? Math.max(0, Number(days.at(-1)?.downloads) || 0) : 0;
  const previous24h =
    days.length > 1 ? Math.max(0, Number(days.at(-2)?.downloads) || 0) : 0;
  const downloads7d = sumDownloads(days.slice(-7));
  const previous7d = sumDownloads(days.slice(-14, -7));
  const downloads30d = sumDownloads(days.slice(-30));
  const previous30d = sumDownloads(days.slice(-60, -30));

  const delta24h = downloads24h - previous24h;
  const delta7d = downloads7d - previous7d;
  const delta30d = downloads30d - previous30d;
  const deltaPct24h = pctDelta(downloads24h, previous24h);
  const deltaPct7d = pctDelta(downloads7d, previous7d);
  const deltaPct30d = pctDelta(downloads30d, previous30d);

  return {
    downloads24h,
    previous24h,
    delta24h,
    deltaPct24h: roundPct(deltaPct24h),
    downloads7d,
    previous7d,
    delta7d,
    deltaPct7d: roundPct(deltaPct7d),
    downloads30d,
    previous30d,
    delta30d,
    deltaPct30d: roundPct(deltaPct30d),
    trendScore24h: computeMoverScore(downloads24h, previous24h),
    trendScore7d: computeMoverScore(downloads7d, previous7d),
    trendScore30d: computeMoverScore(downloads30d, previous30d),
  };
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
    const byPct = deltaPctForWindow(b, window) - deltaPctForWindow(a, window);
    if (byPct !== 0) return byPct;
    const byDelta = deltaForWindow(b, window) - deltaForWindow(a, window);
    if (byDelta !== 0) return byDelta;
    const byDownloads = (b.downloads30d ?? 0) - (a.downloads30d ?? 0);
    if (byDownloads !== 0) return byDownloads;
    return a.name.localeCompare(b.name);
  });
}

export function deltaForWindow(row, window) {
  if (window === "24h") return row.delta24h ?? 0;
  if (window === "7d") return row.delta7d ?? 0;
  return row.delta30d ?? 0;
}

export function deltaPctForWindow(row, window) {
  if (window === "24h") return row.deltaPct24h ?? 0;
  if (window === "7d") return row.deltaPct7d ?? 0;
  return row.deltaPct30d ?? 0;
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
    attempts: 4,
    retryDelayMs: 5_000,
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

function utcDateOnly(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function resolveDownloadRange({
  days = RANGE_DAYS,
  now = new Date(),
  endDate = process.env.NPM_DOWNLOAD_END_DATE,
  lagDays = DOWNLOAD_LAG_DAYS,
} = {}) {
  const safeDays = Math.max(1, Number.parseInt(String(days), 10) || RANGE_DAYS);
  const safeLagDays = Math.max(0, Number.parseInt(String(lagDays), 10) || 0);
  const end =
    typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ? new Date(`${endDate}T00:00:00.000Z`)
      : addUtcDays(utcDateOnly(now), -safeLagDays);
  const start = addUtcDays(end, -(safeDays - 1));
  return {
    start: formatDateKey(start),
    end: formatDateKey(end),
    days: safeDays,
  };
}

export function normalizeRangePayload(payload) {
  const rows = Array.isArray(payload?.downloads) ? payload.downloads : [];
  return rows
    .map((row) => ({
      day: typeof row?.day === "string" ? row.day.slice(0, 10) : "",
      downloads: Math.max(0, Number(row?.downloads) || 0),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day))
    .sort((a, b) => a.day.localeCompare(b.day));
}

async function fetchPackageDownloadRange(name, range, fetchImpl = fetch) {
  const url =
    `https://api.npmjs.org/downloads/range/${range.start}:${range.end}/` +
    encodePackageName(name);
  try {
    const payload = await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 4,
      retryDelayMs: 5_000,
      timeoutMs: 30_000,
      headers: { "User-Agent": USER_AGENT },
    });
    return normalizeRangePayload(payload);
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return [];
    throw err;
  }
}

export async function fetchDownloadMatrix(candidates, { fetchImpl = fetch, log = () => {} } = {}) {
  const range = resolveDownloadRange();
  const matrix = new Map();
  const failures = [];
  let fetched = 0;

  for (const [index, candidate] of candidates.entries()) {
    const key = candidate.name.toLowerCase();
    try {
      const downloads = await fetchPackageDownloadRange(candidate.name, range, fetchImpl);
      matrix.set(key, {
        downloads,
        ...computeDownloadStats(downloads),
        error: null,
      });
      fetched += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ package: candidate.name, error: message });
      matrix.set(key, {
        downloads: [],
        ...computeDownloadStats([]),
        error: message,
      });
      log(`  downloads range failed for ${candidate.name}: ${message}`);
    }

    if (DOWNLOAD_RANGE_DELAY_MS > 0 && index < candidates.length - 1) {
      await sleep(DOWNLOAD_RANGE_DELAY_MS);
    }
  }

  log(
    `  downloads range ${range.start}:${range.end} -> ` +
      `${fetched}/${candidates.length} packages`,
  );
  return { matrix, range, failures };
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
    `fetching daily download ranges for ${candidatesForDownloads.length} ` +
      `of ${candidates.length} repo-linked candidates`,
  );
  let matrix;
  let range;
  try {
    const downloadResult = await fetchDownloadMatrix(candidatesForDownloads, {
      fetchImpl,
      log,
    });
    matrix = downloadResult.matrix;
    range = downloadResult.range;
    failures.push(...downloadResult.failures);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ package: "*download-ranges*", error: message });
    throw err;
  }

  const hydrated = candidatesForDownloads
    .map((candidate) => {
      const fetched = matrix.get(candidate.name.toLowerCase());
      return {
        ...candidate,
        status: "ok",
        ...(fetched ?? { downloads: [], ...computeDownloadStats([]), error: null }),
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
    windowDays: RANGE_DAYS,
    windows: WINDOWS,
    activeWindowDefault: "24h",
    downloadRange: `range:${range.start}:${range.end}`,
    lagHint: "npm public download stats usually lag by 24-48 hours; the default range ends two days back",
    discovery: {
      mode: "registry-search-with-github-repo-filter",
      searchSize: SEARCH_SIZE,
      topLimit: TOP_LIMIT,
      candidateLimit: CANDIDATE_LIMIT,
      downloadRangeDelayMs: DOWNLOAD_RANGE_DELAY_MS,
      downloadLagDays: DOWNLOAD_LAG_DAYS,
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

  // Dual-write: also push to data-store so live readers see fresh data
  // without waiting for a deploy.
  const result = await writeDataStore("npm-packages", payload);

  log(
    `wrote ${OUT} (${rows.length} top repo-linked npm packages) [redis: ${result.source}]`,
  );

  // F3 unknown-mentions lake — every github URL surfaced via npm package
  // metadata (description + homepage + repository.url + keywords).
  const unknownsAccumulator = new Set();
  for (const row of rows) {
    const blob = [
      row.description ?? "",
      row.homepage ?? "",
      row.repositoryUrl ?? row.repository?.url ?? "",
      Array.isArray(row.keywords) ? row.keywords.join(" ") : "",
    ].join(" ");
    for (const u of extractUnknownRepoCandidates(blob, null)) {
      unknownsAccumulator.add(u);
    }
  }
  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "npm", fullName })),
    );
    log(`  lake: ${unknownsAccumulator.size} candidates → data/unknown-mentions.jsonl`);
  }

  return payload;
}

const argv1 = process.argv[1];
const isDirectRun =
  Boolean(argv1) &&
  (import.meta.url === `file://${argv1}` ||
    import.meta.url.endsWith(argv1.replace(/\\/g, "/")));

if (isDirectRun) {
  // T2.6: metadata sidecar — distinguishes outage from quiet day.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "npm",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] npm.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-npm failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "npm",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] npm.json error-write failed:", metaErr);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}
