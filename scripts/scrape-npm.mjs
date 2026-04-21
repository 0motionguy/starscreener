#!/usr/bin/env node
// Scrape npm package download telemetry.
//
// npm exposes public, no-auth download and registry endpoints. This scraper
// tracks a small package watchlist, joins registry metadata back to GitHub
// repository URLs where available, and writes a committed JSON snapshot used
// by /npm and future cross-signal package badges.
//
// Output:
//   - data/npm-packages.json
//
// Cadence: daily. npm download stats lag by roughly 24-48h, so scraping more
// often adds little value and can make the numbers look falsely "stuck."

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry, HttpStatusError } from "./_fetch-json.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT = resolve(DATA_DIR, "npm-packages.json");

export const DEFAULT_NPM_PACKAGES = [
  // Own packages: these are allowed to be missing until we publish them.
  "trendingrepo",
  "@trendingrepo/cli",
  "@trendingrepo/widget",
  "@trendingrepo/sdk",

  // AI/dev ecosystem watchlist: gives the terminal useful live signal now.
  "openai",
  "@anthropic-ai/sdk",
  "ai",
  "@modelcontextprotocol/sdk",
  "langchain",
  "@langchain/core",
  "ollama",
  "@google/genai",
  "next",
  "zod",
];

const DOWNLOAD_RANGE = "last-month";
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

export function parsePackageList(raw) {
  const source =
    typeof raw === "string" && raw.trim().length > 0
      ? raw.split(/[,\n]/)
      : DEFAULT_NPM_PACKAGES;

  const seen = new Set();
  const out = [];
  for (const entry of source) {
    const name = String(entry ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
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
  return days.reduce((sum, day) => sum + Math.max(0, Number(day.downloads) || 0), 0);
}

export function computeDownloadStats(downloads) {
  const days = Array.isArray(downloads) ? downloads.slice() : [];
  const downloadsLastDay = days.length > 0 ? Math.max(0, Number(days.at(-1)?.downloads) || 0) : 0;
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const downloads7d = sumDownloads(last7);
  const previous7d = sumDownloads(prev7);
  const downloads30d = sumDownloads(days);
  const delta7d = downloads7d - previous7d;
  const deltaPct7d =
    previous7d > 0
      ? (delta7d / previous7d) * 100
      : downloads7d > 0
        ? 100
        : 0;

  // Prefer acceleration, but keep mature high-download packages visible.
  const trendScore = Math.round(
    (downloads7d + Math.max(0, delta7d) * 2) *
      Math.max(1, Math.log10(downloads30d + 10)),
  );

  return {
    downloadsLastDay,
    downloads7d,
    previous7d,
    downloads30d,
    delta7d,
    deltaPct7d: Math.round(deltaPct7d * 10) / 10,
    trendScore,
  };
}

async function fetchRegistryPackage(name, fetchImpl = fetch) {
  const url = `https://registry.npmjs.org/${encodePackageName(name)}`;
  try {
    return await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 2,
      timeoutMs: 20_000,
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return null;
    throw err;
  }
}

async function fetchDownloads(name, fetchImpl = fetch) {
  const url = `https://api.npmjs.org/downloads/range/${DOWNLOAD_RANGE}/${encodePackageName(name)}`;
  try {
    return await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 2,
      timeoutMs: 20_000,
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return null;
    throw err;
  }
}

export async function scrapePackage(name, { fetchImpl = fetch } = {}) {
  const registry = await fetchRegistryPackage(name, fetchImpl);
  if (!registry) {
    return {
      name,
      status: "missing",
      npmUrl: npmPackageUrl(name),
      description: null,
      latestVersion: null,
      publishedAt: null,
      repositoryUrl: null,
      linkedRepo: null,
      homepage: null,
      downloads: [],
      ...computeDownloadStats([]),
      error: "not published on npm",
    };
  }

  const downloadsPayload = await fetchDownloads(name, fetchImpl);
  const downloads = Array.isArray(downloadsPayload?.downloads)
    ? downloadsPayload.downloads.map((d) => ({
        day: String(d.day),
        downloads: Math.max(0, Number(d.downloads) || 0),
      }))
    : [];

  const latestVersion =
    typeof registry?.["dist-tags"]?.latest === "string"
      ? registry["dist-tags"].latest
      : null;
  const publishedAt =
    latestVersion && typeof registry?.time?.[latestVersion] === "string"
      ? registry.time[latestVersion]
      : typeof registry?.time?.modified === "string"
        ? registry.time.modified
        : null;
  const repositoryUrl = normalizeRepositoryUrl(registry.repository);
  const linkedRepo = extractGithubRepoFullName(repositoryUrl);

  return {
    name,
    status: downloadsPayload ? "ok" : "error",
    npmUrl: npmPackageUrl(name),
    description: typeof registry.description === "string" ? registry.description : null,
    latestVersion,
    publishedAt,
    repositoryUrl,
    linkedRepo,
    homepage: typeof registry.homepage === "string" ? registry.homepage : null,
    downloads,
    ...computeDownloadStats(downloads),
    error: downloadsPayload ? null : "download stats unavailable",
  };
}

export async function main({ log = console.log, fetchImpl = fetch } = {}) {
  const fetchedAt = new Date().toISOString();
  const packages = parsePackageList(process.env.NPM_PACKAGES);
  const rows = [];

  log(`scraping npm telemetry for ${packages.length} packages`);
  for (const name of packages) {
    try {
      const row = await scrapePackage(name, { fetchImpl });
      rows.push(row);
      log(
        `  ${row.status.padEnd(7)} ${name.padEnd(24)} ` +
          `${row.downloads7d.toLocaleString()} downloads/7d`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        name,
        status: "error",
        npmUrl: npmPackageUrl(name),
        description: null,
        latestVersion: null,
        publishedAt: null,
        repositoryUrl: null,
        linkedRepo: null,
        homepage: null,
        downloads: [],
        ...computeDownloadStats([]),
        error: message,
      });
      log(`  error   ${name}: ${message}`);
    }
  }

  rows.sort((a, b) => {
    const statusRank = (row) => (row.status === "ok" ? 0 : row.status === "missing" ? 2 : 1);
    const rank = statusRank(a) - statusRank(b);
    if (rank !== 0) return rank;
    if (b.trendScore !== a.trendScore) return b.trendScore - a.trendScore;
    return a.name.localeCompare(b.name);
  });

  const payload = {
    fetchedAt,
    source: "npm",
    sourceUrl: "https://api.npmjs.org/downloads/",
    registryUrl: "https://registry.npmjs.org/",
    windowDays: 30,
    downloadRange: DOWNLOAD_RANGE,
    lagHint: "npm public download stats usually lag by 24-48 hours",
    counts: {
      total: rows.length,
      ok: rows.filter((row) => row.status === "ok").length,
      missing: rows.filter((row) => row.status === "missing").length,
      error: rows.filter((row) => row.status === "error").length,
      linkedRepos: rows.filter((row) => row.linkedRepo).length,
    },
    packages: rows,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  log(`wrote ${OUT}`);
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
