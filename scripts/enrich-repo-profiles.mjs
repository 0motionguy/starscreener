#!/usr/bin/env node
// Build durable repo profile snapshots for the hottest repos.
//
// This is the async enrichment path for repo detail pages. It resolves project
// surfaces immediately, then rate-limits expensive website scans through AISO.
// The UI reads data/repo-profiles.json and never has to launch a scan on page
// load.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HttpStatusError,
  fetchJsonWithRetry,
  fetchWithTimeout,
  sleep,
} from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const TRENDING_FILE = resolve(DATA_DIR, "trending.json");
const REPO_METADATA_FILE = resolve(DATA_DIR, "repo-metadata.json");
const NPM_FILE = resolve(DATA_DIR, "npm-packages.json");
const NPM_MANUAL_FILE = resolve(DATA_DIR, "npm-manual-packages.json");
const PH_FILE = resolve(DATA_DIR, "producthunt-launches.json");
const OUT_FILE = resolve(DATA_DIR, "repo-profiles.json");
const CLI_ARGS = parseCliArgs(process.argv.slice(2));

const MODE = normalizeMode(optionString("mode", "PROFILE_ENRICH_MODE", "top"));
const DEFAULT_LIMIT =
  MODE === "top" ? 20 : MODE === "incremental" ? 50 : 5_000;
const DEFAULT_MAX_SCANS =
  MODE === "top" ? Math.min(DEFAULT_LIMIT, 10) : MODE === "incremental" ? 10 : 25;
const LIMIT = optionInt("limit", "PROFILE_ENRICH_LIMIT", DEFAULT_LIMIT, 1, 10_000);
const MAX_SCANS = optionInt("max-scans", "PROFILE_ENRICH_MAX_SCANS", DEFAULT_MAX_SCANS, 0, 10_000);
const RESCAN_DAYS = optionInt("rescan-days", "PROFILE_ENRICH_RESCAN_DAYS", 7, 1, 90);
const GITHUB_LOOKUP = optionBool("github-lookup", "PROFILE_ENRICH_GITHUB_LOOKUP", true);
const AISO_ENABLED = optionBool("aiso", "PROFILE_ENRICH_AISO", true);
const GITHUB_DELAY_MS = optionInt("github-delay-ms", "PROFILE_ENRICH_GITHUB_DELAY_MS", 250, 0, 10_000);
const AISO_SCAN_DELAY_MS = optionInt("aiso-delay-ms", "PROFILE_ENRICH_AISO_DELAY_MS", 1_000, 0, 60_000);
const AISO_WAIT_MS = optionInt("aiso-wait-ms", "PROFILE_ENRICH_AISO_WAIT_MS", 90_000, 5_000, 600_000);
const AISO_POLL_MS = optionInt("aiso-poll-ms", "PROFILE_ENRICH_AISO_POLL_MS", 2_000, 500, 30_000);
const AISO_DAILY_SCAN_BUDGET = optionInt("aiso-daily-budget", "PROFILE_ENRICH_AISO_DAILY_SCAN_BUDGET", 30, 0, 1_000);
const AISO_SOURCE = optionString("aiso-source", "PROFILE_ENRICH_AISO_SOURCE", "api");
const AISO_PROJECT_NAME = optionString("aiso-project", "PROFILE_ENRICH_AISO_PROJECT", "TrendingRepo repo profile enrichment");
const AISO_PROJECT_URL = optionString("aiso-project-url", "PROFILE_ENRICH_AISO_PROJECT_URL", "https://trendingrepo.com");
const AISO_PROMOTION_SECRET = optionString(
  "aiso-promotion-secret",
  "PROFILE_ENRICH_AISO_PROMOTION_SECRET",
  process.env.AISO_TRENDINGREPO_SECRET ?? "",
);
const AISO_BILLING_TIER = optionString("aiso-billing-tier", "PROFILE_ENRICH_AISO_BILLING_TIER", "free");
const AISO_PROFILE = optionString("aiso-profile", "PROFILE_ENRICH_AISO_PROFILE", "");
const KIMI_API_KEY = optionString("kimi-api-key", "KIMI_API_KEY", "");
const KIMI_ENABLED = optionBool("kimi", "PROFILE_ENRICH_KIMI", Boolean(KIMI_API_KEY));
const KIMI_BASE_URL = optionString("kimi-base-url", "KIMI_BASE_URL", "https://api.kimi.com/coding/v1").replace(/\/+$/, "");
const KIMI_MODEL = optionString("kimi-model", "KIMI_MODEL", "kimi-for-coding");
const KIMI_MAX_REPOS = optionInt(
  "kimi-max-repos",
  "PROFILE_ENRICH_KIMI_MAX_REPOS",
  Math.min(LIMIT, MAX_SCANS > 0 ? MAX_SCANS : 3),
  0,
  1_000,
);
const KIMI_TTL_DAYS = optionInt("kimi-ttl-days", "PROFILE_ENRICH_KIMI_TTL_DAYS", 1, 1, 30);
const KIMI_TIMEOUT_MS = optionInt("kimi-timeout-ms", "PROFILE_ENRICH_KIMI_TIMEOUT_MS", 45_000, 5_000, 120_000);
const KIMI_MAX_TOKENS = optionInt("kimi-max-tokens", "PROFILE_ENRICH_KIMI_MAX_TOKENS", 520, 120, 2_000);
const KIMI_DELAY_MS = optionInt("kimi-delay-ms", "PROFILE_ENRICH_KIMI_DELAY_MS", 500, 0, 30_000);

function clampInt(raw, fallback, min, max) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseCliArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (!token.startsWith("--")) continue;
    const withoutPrefix = token.slice(2);
    const eq = withoutPrefix.indexOf("=");
    if (eq >= 0) {
      out.set(withoutPrefix.slice(0, eq), withoutPrefix.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (typeof next === "string" && !next.startsWith("--")) {
      out.set(withoutPrefix, next);
      i += 1;
      continue;
    }
    out.set(withoutPrefix, "true");
  }
  return out;
}

function optionString(name, envName, fallback = "") {
  const cli = CLI_ARGS.get(name);
  if (typeof cli === "string" && cli.trim()) return cli.trim();
  const env = process.env[envName];
  if (typeof env === "string" && env.trim()) return env.trim();
  return fallback;
}

function optionInt(name, envName, fallback, min, max) {
  return clampInt(CLI_ARGS.get(name) ?? process.env[envName], fallback, min, max);
}

function optionBool(name, envName, fallback) {
  const raw = CLI_ARGS.has(name) ? CLI_ARGS.get(name) : process.env[envName];
  if (raw == null) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function normalizeMode(raw) {
  const value = String(raw ?? "top").trim().toLowerCase();
  return value === "catchup" || value === "incremental" ? value : "top";
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

function parseIncludes() {
  return optionString("include", "PROFILE_ENRICH_INCLUDE_REPOS", "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value) => value.includes("/"));
}

// Stale-queue guard: a queue file older than this is ignored — we fall
// back to the existing top-N selection. Matches the cadence of the
// completion-check workflow (*/30 min) with a 4x safety margin.
const QUEUE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Read profile-completion-queue.json (when --queue or
 * PROFILE_ENRICH_QUEUE_FILE is set) and return the list of fullNames whose
 * recommendedAction is enrich-eligible ("enrich" or "both"), already sorted
 * by priority desc. Returns [] when no queue file is configured, the file is
 * missing, or the queue is stale (>2h old) — we never block the existing
 * top-N path on a stale queue.
 */
async function parseQueueFile() {
  const queuePath = optionString("queue", "PROFILE_ENRICH_QUEUE_FILE", "");
  if (!queuePath) return [];
  let raw;
  try {
    raw = await readFile(queuePath, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.warn(`[enrich] queue file not found: ${queuePath} — falling back to top-N selection`);
      return [];
    }
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[enrich] queue file invalid JSON: ${queuePath} — falling back to top-N (${err.message})`);
    return [];
  }
  const generatedAt = Date.parse(parsed?.generatedAt ?? "");
  if (Number.isFinite(generatedAt) && Date.now() - generatedAt > QUEUE_MAX_AGE_MS) {
    console.warn(
      `[enrich] queue file ${queuePath} is stale (generatedAt=${parsed.generatedAt}) — falling back to top-N`,
    );
    return [];
  }
  const incomplete = Array.isArray(parsed?.incomplete) ? parsed.incomplete : [];
  return incomplete
    .filter(
      (entry) =>
        entry?.fullName?.includes("/") &&
        (entry.recommendedAction === "enrich" || entry.recommendedAction === "both"),
    )
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((entry) => entry.fullName);
}

function parseScanOverrides() {
  const map = new Map();
  const raw = optionString("scan-overrides", "PROFILE_ENRICH_SCAN_ID_OVERRIDES", "");
  for (const entry of raw.split(/[,\n]/)) {
    const trimmed = entry.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const [fullName, scanId] = trimmed.split("=", 2);
    if (fullName?.includes("/") && scanId) {
      map.set(normalizeRepoKey(fullName), scanId.trim());
    }
  }
  return map;
}

function cleanUrl(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function isGithubUrl(url) {
  if (!url) return false;
  try {
    return /(^|\.)github\.com$/i.test(new URL(url).hostname);
  } catch {
    return /github\.com/i.test(String(url));
  }
}

function futureIso(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function truncateError(error) {
  return String(error?.message ?? error).replace(/\s+/g, " ").trim().slice(0, 500);
}

function truncateText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeRepoKey(fullName) {
  return String(fullName ?? "").toLowerCase();
}

function repoProfileUrl(fullName) {
  const [owner, name] = String(fullName ?? "").split("/");
  if (!owner || !name) return AISO_PROJECT_URL;
  return `https://trendingrepo.com/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function aisoProjectName(fullName) {
  const suffix = String(fullName ?? "").trim();
  return truncateText(suffix ? `TrendingRepo: ${suffix}` : AISO_PROJECT_NAME, 80);
}

function isFreshIso(iso, days) {
  const ts = Date.parse(iso ?? "");
  if (!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs <= days * 86_400_000;
}

function buildMetadataIndex(metadataFile) {
  const map = new Map();
  for (const item of metadataFile.items ?? []) {
    if (item?.fullName) map.set(normalizeRepoKey(item.fullName), item);
  }
  return map;
}

function buildProductHuntIndex(phFile) {
  const map = new Map();
  for (const launch of phFile.launches ?? []) {
    if (!launch?.linkedRepo) continue;
    const key = normalizeRepoKey(launch.linkedRepo);
    const existing = map.get(key);
    if (!existing || (launch.votesCount ?? 0) > (existing.votesCount ?? 0)) {
      map.set(key, launch);
    }
  }
  return map;
}

function buildNpmIndex(...files) {
  const map = new Map();
  for (const file of files) {
    for (const pkg of file.packages ?? []) {
      if (!pkg?.linkedRepo) continue;
      const key = normalizeRepoKey(pkg.linkedRepo);
      const list = map.get(key) ?? [];
      if (!list.some((existing) => existing.name === pkg.name)) list.push(pkg);
      map.set(key, list);
    }
  }
  return map;
}

function buildTrendingRankMap(trendingFile) {
  const map = new Map();
  const rows = trendingFile.buckets?.past_24_hours?.All ?? [];
  let rank = 0;
  for (const row of rows) {
    const fullName = row?.repo_name;
    if (!fullName || !fullName.includes("/")) continue;
    const key = normalizeRepoKey(fullName);
    if (map.has(key)) continue;
    rank += 1;
    map.set(key, rank);
  }
  return map;
}

function collectAllRepoNames(trendingFile, metadataByRepo, profilesByRepo) {
  const names = new Set();
  for (const key of metadataByRepo.keys()) names.add(key);
  for (const key of profilesByRepo.keys()) names.add(key);
  for (const row of trendingFile.buckets?.past_24_hours?.All ?? []) {
    const fullName = row?.repo_name;
    if (fullName?.includes("/")) names.add(normalizeRepoKey(fullName));
  }
  return Array.from(names.values());
}

function profileNeedsRefresh(profile) {
  if (!profile) return true;
  if (profile.status !== "scanned") return true;
  const nextScanAt = Date.parse(profile.nextScanAfter ?? "");
  if (!Number.isFinite(nextScanAt)) return true;
  return nextScanAt <= Date.now();
}

function candidateSort(a, b) {
  const priority = (candidate) => {
    // completion_queue and manual_include both rank above trending — operator
    // intent + audit-driven repos must run before the rank-only top-N tail.
    if (
      candidate.selectedFrom === "manual_include" ||
      candidate.selectedFrom === "completion_queue"
    ) {
      return 0;
    }
    return candidate.rank != null ? 1 : 2;
  };
  const ap = priority(a);
  const bp = priority(b);
  if (ap !== bp) return ap - bp;
  const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
  const br = b.rank ?? Number.MAX_SAFE_INTEGER;
  if (ar !== br) return ar - br;
  const at = Date.parse(a.existing?.lastProfiledAt ?? "");
  const bt = Date.parse(b.existing?.lastProfiledAt ?? "");
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  if (!Number.isFinite(at) && Number.isFinite(bt)) return -1;
  if (Number.isFinite(at) && !Number.isFinite(bt)) return 1;
  return a.fullName.localeCompare(b.fullName);
}

function collectCandidates(trendingFile, metadataByRepo, profilesByRepo, queueRepos = []) {
  const rankMap = buildTrendingRankMap(trendingFile);
  const includeRepos = parseIncludes();
  const seen = new Set();
  const out = [];

  // 1. completion-queue entries first — already pre-sorted by priority desc
  //    in parseQueueFile(). Highest precedence so the audit feedback loop
  //    runs before the static --include and trending top-N pipelines.
  for (const fullName of queueRepos) {
    const key = normalizeRepoKey(fullName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fullName,
      rank: rankMap.get(key) ?? null,
      selectedFrom: "completion_queue",
      metadata: metadataByRepo.get(key) ?? null,
      existing: profilesByRepo.get(key) ?? null,
    });
  }

  for (const fullName of includeRepos) {
    const key = normalizeRepoKey(fullName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fullName,
      rank: rankMap.get(key) ?? null,
      selectedFrom: "manual_include",
      metadata: metadataByRepo.get(key) ?? null,
      existing: profilesByRepo.get(key) ?? null,
    });
  }

  if (MODE === "top") {
    for (const [key, rank] of rankMap.entries()) {
      if (out.filter((candidate) => candidate.selectedFrom === "trending_top_24h").length >= LIMIT) {
        break;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        fullName: metadataByRepo.get(key)?.fullName ?? key,
        rank,
        selectedFrom: "trending_top_24h",
        metadata: metadataByRepo.get(key) ?? null,
        existing: profilesByRepo.get(key) ?? null,
      });
    }
    return out;
  }

  const allNames = collectAllRepoNames(trendingFile, metadataByRepo, profilesByRepo)
    .filter((key) => !seen.has(key))
    .map((key) => ({
      key,
      fullName: metadataByRepo.get(key)?.fullName ?? profilesByRepo.get(key)?.fullName ?? key,
      rank: rankMap.get(key) ?? null,
      selectedFrom: MODE === "catchup" ? "catchup" : "incremental",
      metadata: metadataByRepo.get(key) ?? null,
      existing: profilesByRepo.get(key) ?? null,
    }))
    .filter((candidate) => MODE === "catchup" || profileNeedsRefresh(candidate.existing))
    .sort(candidateSort)
    .slice(0, LIMIT);

  for (const candidate of allNames) {
    seen.add(candidate.key);
    out.push(candidate);
  }

  return out;
}

async function fetchGithubHomepage(fullName) {
  if (!GITHUB_LOOKUP) return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return null;
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "trendingrepo-profile-enricher",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const repo = await fetchJsonWithRetry(
      `https://api.github.com/repos/${owner}/${name}`,
      {
        headers,
        attempts: 2,
        retryDelayMs: 750,
        timeoutMs: 15_000,
      },
    );
    return cleanUrl(repo?.homepage);
  } catch {
    return null;
  } finally {
    if (GITHUB_DELAY_MS > 0) await sleep(GITHUB_DELAY_MS);
  }
}

async function resolveWebsite(candidate, phLaunch, npmPackages) {
  const phWebsite = cleanUrl(phLaunch?.website);
  if (phWebsite && !isGithubUrl(phWebsite)) {
    return { websiteUrl: phWebsite, websiteSource: "producthunt" };
  }

  const metadataWebsite = cleanUrl(candidate.metadata?.homepageUrl);
  if (metadataWebsite && !isGithubUrl(metadataWebsite)) {
    return { websiteUrl: metadataWebsite, websiteSource: "github_homepage" };
  }

  const npmWebsite = npmPackages
    .map((pkg) => cleanUrl(pkg.homepage))
    .find((url) => url && !isGithubUrl(url));
  if (npmWebsite) {
    return { websiteUrl: npmWebsite, websiteSource: "npm_homepage" };
  }

  const githubHomepage = await fetchGithubHomepage(candidate.fullName);
  if (githubHomepage && !isGithubUrl(githubHomepage)) {
    return { websiteUrl: githubHomepage, websiteSource: "github_homepage" };
  }

  return { websiteUrl: null, websiteSource: null };
}

function resolveDocsUrl(npmPackages) {
  return (
    npmPackages
      .map((pkg) => cleanUrl(pkg.homepage))
      .find((url) => url && /docs|documentation|readme/i.test(url)) ?? null
  );
}

async function isLocalAisoReady() {
  try {
    const response = await fetchWithTimeout("http://localhost:3033", {
      method: "GET",
      timeoutMs: 1_500,
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveAisoBaseUrl() {
  const explicitCli = optionString("aiso-base-url", "PROFILE_ENRICH_AISO_BASE_URL", "");
  const explicit =
    explicitCli ||
    process.env.AISO_API_URL ||
    process.env.AISO_TOOLS_API_URL ||
    process.env.AISOTOOLS_API_URL ||
    "";
  if (explicit) return explicit.replace(/\/+$/, "");
  if (await isLocalAisoReady()) return "http://localhost:3033";
  return "https://aiso.tools";
}

function resultPageUrl(baseUrl, scanId) {
  return `${baseUrl}/scan/${scanId}`;
}

function normalizeAisoScan(baseUrl, payload) {
  return {
    scanId: payload.scanId,
    url: payload.url,
    projectName: payload.projectName ?? null,
    projectUrl: payload.projectUrl ?? null,
    source: payload.source ?? null,
    status: payload.status,
    score: payload.score ?? null,
    tier: payload.tier ?? null,
    runtimeVisibility: payload.runtimeVisibility ?? null,
    scanDurationMs: payload.scanDurationMs ?? null,
    completedAt: payload.completedAt ?? null,
    resultUrl: resultPageUrl(baseUrl, payload.scanId),
    dimensions: (payload.dimensions ?? []).map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      weight: dimension.weight ?? 0,
      score: dimension.score ?? 0,
      status: dimension.status ?? "warn",
      issuesCount: dimension.issuesCount ?? dimension.issues_count ?? 0,
      details: dimension.details ?? {},
    })),
    issues: (payload.issues ?? []).map((issue) => ({
      severity: issue.severity,
      title: issue.title,
      fix: issue.fix,
      dimensionKey: issue.dimensionKey ?? issue.dimension_key ?? null,
    })),
    promptTests: (payload.promptTests ?? []).map((test) => ({
      engine: test.engine,
      prompt: test.prompt,
      cited: Boolean(test.cited),
      position: test.position ?? 0,
      brandMentioned: Boolean(test.brandMentioned ?? test.brand_mentioned),
      snippet: test.snippet ?? null,
    })),
  };
}

function existingScanIsFresh(existing, websiteUrl) {
  if (!existing?.aisoScan || existing.websiteUrl !== websiteUrl) return false;
  if (existing.aisoScan.status !== "completed") return false;
  const profiledAt = Date.parse(existing.lastProfiledAt ?? "");
  if (!Number.isFinite(profiledAt)) return false;
  return Date.now() - profiledAt < RESCAN_DAYS * 86_400_000;
}

function countRecentAisoSubmissions(profilesByRepo) {
  let count = 0;
  for (const profile of profilesByRepo.values()) {
    if (!profile?.aisoScan?.scanId) continue;
    const scanAt = profile.aisoScan.completedAt ?? profile.lastProfiledAt;
    if (isFreshIso(scanAt, 1)) count += 1;
  }
  return count;
}

async function submitAisoScan(baseUrl, websiteUrl, candidate) {
  const headers = {
    "content-type": "application/json",
    "x-aiso-source": AISO_SOURCE,
    "x-aiso-project": aisoProjectName(candidate?.fullName),
    "x-aiso-project-url": repoProfileUrl(candidate?.fullName),
  };
  if (AISO_PROMOTION_SECRET) {
    headers["x-aiso-promotion-secret"] = AISO_PROMOTION_SECRET;
  }
  const body = {
    url: websiteUrl,
    source: AISO_SOURCE,
    projectName: aisoProjectName(candidate?.fullName),
    projectUrl: repoProfileUrl(candidate?.fullName),
    billingTier: AISO_BILLING_TIER,
  };
  if (AISO_PROFILE) body.profile = AISO_PROFILE;
  return fetchJsonWithRetry(`${baseUrl}/api/scan`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    attempts: 1,
    timeoutMs: 20_000,
  });
}

async function fetchAisoScan(baseUrl, scanId) {
  return fetchJsonWithRetry(`${baseUrl}/api/scan/${scanId}`, {
    method: "GET",
    headers: { accept: "application/json" },
    attempts: 1,
    timeoutMs: 20_000,
  });
}

async function runAisoScan({ baseUrl, websiteUrl, existing, candidate, scanIdOverride = null }) {
  if (!AISO_ENABLED) {
    return {
      status: existing?.aisoScan ? "scanned" : "scan_pending",
      aisoScan: existing?.aisoScan ?? null,
      error: null,
      countedAsScan: false,
    };
  }

  if (existingScanIsFresh(existing, websiteUrl)) {
    return {
      status: "scanned",
      aisoScan: existing.aisoScan,
      error: null,
      countedAsScan: false,
    };
  }

  let submitted = scanIdOverride
    ? { scanId: scanIdOverride, status: "running", source: "override" }
    : null;
  if (!submitted) {
    try {
      submitted = await submitAisoScan(baseUrl, websiteUrl, candidate);
    } catch (err) {
      const status = err instanceof HttpStatusError && err.status === 429
        ? "rate_limited"
        : "scan_failed";
      return {
        status,
        aisoScan: existing?.aisoScan ?? null,
        error: truncateError(err),
        countedAsScan: status !== "rate_limited",
      };
    }
  }

  const scanId = submitted?.scanId;
  if (!scanId) {
    return {
      status: "scan_failed",
      aisoScan: existing?.aisoScan ?? null,
      error: "AISO submit returned no scanId",
      countedAsScan: !scanIdOverride,
    };
  }

  const deadline = Date.now() + AISO_WAIT_MS;
  let last = {
    scanId,
    url: websiteUrl,
    projectName: null,
    projectUrl: null,
    source: submitted.source ?? null,
    status: submitted.status ?? "queued",
    score: null,
    tier: null,
    runtimeVisibility: null,
    scanDurationMs: null,
    completedAt: null,
    resultUrl: resultPageUrl(baseUrl, scanId),
    dimensions: [],
    issues: [],
    promptTests: [],
  };

  while (Date.now() <= deadline) {
    try {
      const payload = await fetchAisoScan(baseUrl, scanId);
      last = normalizeAisoScan(baseUrl, payload);
      if (last.status !== "queued" && last.status !== "running") break;
    } catch (err) {
      return {
        status: "scan_failed",
        aisoScan: last,
        error: truncateError(err),
        countedAsScan: !scanIdOverride,
      };
    }
    await sleep(AISO_POLL_MS);
  }

  const status =
    last.status === "completed"
      ? "scanned"
      : last.status === "failed"
        ? "scan_failed"
        : "scan_running";

  return {
    status,
    aisoScan: last,
    error: status === "scan_failed" ? "AISO scan failed" : null,
    countedAsScan: !scanIdOverride,
  };
}

function existingBriefIsFresh(existing) {
  return Boolean(
    existing?.expertTrendBrief?.provider === "kimi" &&
      existing.expertTrendBrief.summary &&
      isFreshIso(existing.expertTrendBrief.generatedAt, KIMI_TTL_DAYS),
  );
}

function parseKimiJson(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

async function readKimiStream(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta;
        if (typeof delta?.content === "string") text += delta.content;
      } catch {
        // Ignore malformed keepalive or proxy lines; the final JSON validator
        // below decides whether the accumulated model output is usable.
      }
    }
  }
  return text;
}

async function callKimiJson({ systemPrompt, userMessage }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KIMI_TIMEOUT_MS);
  try {
    const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${KIMI_API_KEY}`,
        "content-type": "application/json",
        accept: "text/event-stream",
        "user-agent": "claude-cli/1.0",
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        max_tokens: KIMI_MAX_TOKENS,
        temperature: 0.25,
        stream: true,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!response.ok) {
      await response.arrayBuffer().catch(() => null);
      throw new Error(`Kimi ${response.status} ${response.statusText || "request failed"}`);
    }
    return parseKimiJson(await readKimiStream(response));
  } finally {
    clearTimeout(timeout);
  }
}

function safeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => truncateText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeExpertTrendBrief(raw) {
  if (!raw || typeof raw !== "object") return null;
  const headline = truncateText(raw.headline, 120);
  const summary = truncateText(raw.summary, 600);
  if (!headline || !summary) return null;
  return {
    provider: "kimi",
    model: KIMI_MODEL,
    generatedAt: new Date().toISOString(),
    headline,
    summary,
    drivers: safeStringArray(raw.drivers, 4, 180),
    evidence: safeStringArray(raw.evidence, 4, 180),
    caveats: safeStringArray(raw.caveats, 3, 180),
  };
}

function buildKimiFacts({ candidate, baseProfile, scanResult, phLaunch, npmPackages }) {
  const metadata = candidate.metadata ?? {};
  const scan = scanResult?.aisoScan ?? baseProfile.aisoScan ?? null;
  return {
    repo: {
      fullName: baseProfile.fullName,
      rank24h: candidate.rank,
      selectedFrom: candidate.selectedFrom,
      githubUrl: baseProfile.surfaces.githubUrl,
      description: truncateText(metadata.description, 320),
      language: metadata.language ?? null,
      topics: Array.isArray(metadata.topics) ? metadata.topics.slice(0, 12) : [],
      stars: metadata.stars ?? null,
      forks: metadata.forks ?? null,
      openIssues: metadata.openIssues ?? null,
      createdAt: metadata.createdAt ?? null,
      pushedAt: metadata.pushedAt ?? null,
    },
    surfaces: {
      websiteUrl: baseProfile.websiteUrl,
      websiteSource: baseProfile.websiteSource,
      docsUrl: baseProfile.surfaces.docsUrl,
      npmPackages: npmPackages.slice(0, 5).map((pkg) => ({
        name: pkg.name,
        homepage: pkg.homepage ?? null,
        downloads7d: pkg.downloads7d ?? null,
        weeklyDownloads: pkg.discovery?.weeklyDownloads ?? null,
      })),
      productHunt: phLaunch
        ? {
            id: phLaunch.id ?? null,
            name: phLaunch.name ?? null,
            tagline: phLaunch.tagline ?? null,
            votesCount: phLaunch.votesCount ?? null,
            commentsCount: phLaunch.commentsCount ?? null,
            website: phLaunch.website ?? null,
          }
        : null,
    },
    aiso: scan
      ? {
          status: scan.status,
          score: scan.score ?? null,
          tier: scan.tier ?? null,
          runtimeVisibility: scan.runtimeVisibility ?? null,
          completedAt: scan.completedAt ?? null,
          topDimensions: (scan.dimensions ?? [])
            .slice()
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, 5)
            .map((dimension) => ({
              key: dimension.key,
              label: dimension.label,
              score: dimension.score,
              status: dimension.status,
              issuesCount: dimension.issuesCount,
            })),
          topIssues: (scan.issues ?? []).slice(0, 5).map((issue) => ({
            severity: issue.severity,
            title: issue.title,
            fix: issue.fix,
          })),
        }
      : null,
  };
}

async function buildExpertTrendBrief(context) {
  if (!KIMI_ENABLED || !KIMI_API_KEY) {
    return context.existing?.expertTrendBrief ?? null;
  }
  if (existingBriefIsFresh(context.existing)) {
    return context.existing.expertTrendBrief;
  }

  const facts = buildKimiFacts(context);
  const systemPrompt = [
    "You are an expert open-source trend analyst for TrendingRepo.",
    "Use only the supplied facts. Do not invent adoption, revenue, customers, or benchmarks.",
    "Explain why the repository is trending now and how its website/AISO surface affects AI discoverability.",
    "Return strict JSON only with keys: headline, summary, drivers, evidence, caveats.",
  ].join(" ");
  const userMessage = JSON.stringify(
    {
      task:
        "Write a concise expert trend brief for a repo profile page. Keep summary under 110 words. drivers/evidence/caveats are short bullet strings.",
      facts,
    },
    null,
    2,
  );

  const parsed = await callKimiJson({ systemPrompt, userMessage });
  const brief = normalizeExpertTrendBrief(parsed);
  if (!brief) throw new Error("Kimi returned unusable JSON");
  return brief;
}

async function writeProfilesFile(profilesByRepo, selection, { mirrorToStore = false } = {}) {
  const profiles = Array.from(profilesByRepo.values()).sort((a, b) => {
    const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
    const br = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return a.fullName.localeCompare(b.fullName);
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    version: 1,
    selection,
    profiles,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(payload, null, 2) + "\n",
    "utf8",
  );

  // The script calls writeProfilesFile incrementally after every repo to
  // preserve progress on crash; we don't want to burn one Redis write per
  // repo, so the caller opts in to mirroring only at the end of the run.
  if (mirrorToStore) {
    return writeDataStore("repo-profiles", payload);
  }
  return null;
}

async function main() {
  const [
    trendingFile,
    metadataFile,
    npmFile,
    npmManualFile,
    phFile,
    existingFile,
  ] = await Promise.all([
    readJson(TRENDING_FILE, { buckets: {} }),
    readJson(REPO_METADATA_FILE, { items: [] }),
    readJson(NPM_FILE, { packages: [] }),
    readJson(NPM_MANUAL_FILE, { packages: [] }),
    readJson(PH_FILE, { launches: [] }),
    readJson(OUT_FILE, { profiles: [] }),
  ]);

  const metadataByRepo = buildMetadataIndex(metadataFile);
  const phByRepo = buildProductHuntIndex(phFile);
  const npmByRepo = buildNpmIndex(npmFile, npmManualFile);
  const scanOverrides = parseScanOverrides();
  const queueRepos = await parseQueueFile();
  const profilesByRepo = new Map(
    (existingFile.profiles ?? []).map((profile) => [
      normalizeRepoKey(profile.fullName),
      profile,
    ]),
  );
  const candidates = collectCandidates(
    trendingFile,
    metadataByRepo,
    profilesByRepo,
    queueRepos,
  );
  const aisoBaseUrl = await resolveAisoBaseUrl();
  const selection = {
    source: MODE,
    limit: LIMIT,
    maxScans: MAX_SCANS,
    dailyScanBudget: AISO_DAILY_SCAN_BUDGET,
    fromQueue: queueRepos.length,
    scanned: 0,
    queued: 0,
    noWebsite: 0,
    failed: 0,
    expertBriefs: 0,
  };
  let scansStarted = 0;
  let kimiStarted = 0;
  const recentAisoSubmissions = countRecentAisoSubmissions(profilesByRepo);
  let aisoRateLimited = false;

  console.log(
    `repo profiles: mode=${MODE} candidates=${candidates.length} fromQueue=${queueRepos.length} maxScans=${MAX_SCANS} dailyBudget=${AISO_DAILY_SCAN_BUDGET} recent24h=${recentAisoSubmissions} aiso=${AISO_ENABLED ? aisoBaseUrl : "disabled"} kimi=${KIMI_ENABLED && KIMI_API_KEY ? `${KIMI_MODEL} max=${KIMI_MAX_REPOS}` : "disabled"}`,
  );

  for (const candidate of candidates) {
    const key = normalizeRepoKey(candidate.fullName);
    const existing = profilesByRepo.get(key) ?? null;
    const phLaunch = phByRepo.get(key) ?? null;
    const npmPackages = npmByRepo.get(key) ?? [];
    const { websiteUrl, websiteSource } = await resolveWebsite(
      candidate,
      phLaunch,
      npmPackages,
    );
    const now = new Date().toISOString();
    const githubUrl =
      candidate.metadata?.url ?? `https://github.com/${candidate.fullName}`;
    const baseProfile = {
      fullName: candidate.metadata?.fullName ?? candidate.fullName,
      rank: candidate.rank,
      selectedFrom: candidate.selectedFrom,
      websiteUrl,
      websiteSource,
      status: "no_website",
      lastProfiledAt: now,
      nextScanAfter: null,
      surfaces: {
        githubUrl,
        docsUrl: resolveDocsUrl(npmPackages),
        npmPackages: npmPackages.map((pkg) => pkg.name),
        productHuntLaunchId: phLaunch?.id ?? null,
      },
      aisoScan: existing?.aisoScan ?? null,
      expertTrendBrief: existing?.expertTrendBrief ?? null,
      error: null,
    };

    if (!websiteUrl) {
      if (KIMI_ENABLED && KIMI_API_KEY && kimiStarted < KIMI_MAX_REPOS && !existingBriefIsFresh(existing)) {
        try {
          baseProfile.expertTrendBrief = await buildExpertTrendBrief({
            candidate,
            baseProfile,
            existing,
            scanResult: null,
            phLaunch,
            npmPackages,
          });
          if (baseProfile.expertTrendBrief !== existing?.expertTrendBrief) {
            selection.expertBriefs += 1;
          }
        } catch (err) {
          console.warn(`kimi skipped ${candidate.fullName}: ${truncateError(err)}`);
        } finally {
          kimiStarted += 1;
          if (KIMI_DELAY_MS > 0) await sleep(KIMI_DELAY_MS);
        }
      }
      selection.noWebsite += 1;
      profilesByRepo.set(key, baseProfile);
      console.log(`skip no website: ${candidate.fullName}`);
      await writeProfilesFile(profilesByRepo, selection);
      continue;
    }

    let scanResult;
    const scanIdOverride = scanOverrides.get(key) ?? null;
    if (existingScanIsFresh(existing, websiteUrl)) {
      scanResult = {
        status: "scanned",
        aisoScan: existing.aisoScan,
        error: null,
        countedAsScan: false,
      };
    } else if (scanIdOverride) {
      scanResult = await runAisoScan({
        baseUrl: aisoBaseUrl,
        websiteUrl,
        existing,
        scanIdOverride,
        candidate,
      });
    } else if (
      aisoRateLimited ||
      scansStarted >= MAX_SCANS ||
      (AISO_DAILY_SCAN_BUDGET > 0 &&
        recentAisoSubmissions + scansStarted >= AISO_DAILY_SCAN_BUDGET)
    ) {
      scanResult = {
        status: "scan_pending",
        aisoScan: existing?.aisoScan ?? null,
        error: null,
        countedAsScan: false,
      };
    } else {
      scanResult = await runAisoScan({
        baseUrl: aisoBaseUrl,
        websiteUrl,
        existing,
        candidate,
      });
      if (scanResult.countedAsScan) {
        scansStarted += 1;
        if (AISO_SCAN_DELAY_MS > 0) await sleep(AISO_SCAN_DELAY_MS);
      }
      if (scanResult.status === "rate_limited") {
        aisoRateLimited = true;
      }
    }

    if (scanResult.status === "scanned") selection.scanned += 1;
    else if (scanResult.status === "scan_failed") {
      selection.failed += 1;
    } else {
      selection.queued += 1;
    }

    let expertTrendBrief = baseProfile.expertTrendBrief;
    if (KIMI_ENABLED && KIMI_API_KEY && kimiStarted < KIMI_MAX_REPOS && !existingBriefIsFresh(existing)) {
      try {
        expertTrendBrief = await buildExpertTrendBrief({
          candidate,
          baseProfile,
          existing,
          scanResult,
          phLaunch,
          npmPackages,
        });
        if (expertTrendBrief !== existing?.expertTrendBrief) {
          selection.expertBriefs += 1;
        }
      } catch (err) {
        console.warn(`kimi skipped ${candidate.fullName}: ${truncateError(err)}`);
      } finally {
        kimiStarted += 1;
        if (KIMI_DELAY_MS > 0) await sleep(KIMI_DELAY_MS);
      }
    }

    profilesByRepo.set(key, {
      ...baseProfile,
      status: scanResult.status,
      nextScanAfter: scanResult.status === "scanned" ? futureIso(RESCAN_DAYS) : null,
      aisoScan: scanResult.aisoScan,
      expertTrendBrief,
      error: scanResult.error,
    });
    console.log(`${scanResult.status}: ${candidate.fullName} -> ${websiteUrl}`);
    await writeProfilesFile(profilesByRepo, selection);
  }

  const redisResult = await writeProfilesFile(profilesByRepo, selection, {
    mirrorToStore: true,
  });
  console.log(
    `repo profiles wrote ${OUT_FILE} scanned=${selection.scanned} queued=${selection.queued} noWebsite=${selection.noWebsite} failed=${selection.failed} expertBriefs=${selection.expertBriefs} [redis: ${redisResult?.source ?? "skipped"}]`,
  );
}

main()
  .catch((err) => {
    console.error("enrich-repo-profiles failed:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
