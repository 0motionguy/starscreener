#!/usr/bin/env tsx

// Cross-source mentions sweep.
//
// For each top-N trending repo (or each repo from a profile-completion queue),
// actively probes 8 channels — Twitter, Reddit, HackerNews, Bluesky, dev.to,
// Lobsters, ProductHunt, and Tavily web search — and writes:
//   - data/repo-mentions-detail.jsonl   (append-only event log)
//   - data/repo-mentions-detail-rollup.json + Redis
//                                       (top 5 per source, last 7d)
//
// Closes the source-first blind spot in the existing 88 collectors: those
// scan one source for whatever mentions appear; this script flips the loop
// and asks every channel "show me mentions of repo X". Twitter is the only
// existing repo-first collector; this generalizes that pattern to all 8.
//
// Usage:
//   npm run sweep:mentions:dry           — top 5, no writes
//   npm run sweep:mentions -- --top 50   — sweep top 50
//   npm run sweep:mentions -- --queue data/profile-completion-queue.json
//                                          consume audit queue (priority order)
//   npm run sweep:mentions -- --repo owner/name --concurrency 1
//                                          single-repo probe (debug)
//   npm run sweep:mentions -- --source-only tavily
//                                          isolate one channel for verification
//   npm run sweep:mentions -- --mode catchup
//                                          full-corpus reconciliation (daily 05:15 lane);
//                                          ignores --top, sweeps every trending entry,
//                                          forces JSONL compaction.
//   npm run sweep:mentions -- --compact  also compact JSONL to last 7d this run.
//
// Production behavior:
//   - Per-rank Twitter depth: top-10 → 50 tweets/query, top-50 → 30,
//     top-200 → 20, tail → 10. Saves Apify cost while keeping signal-rich
//     repos well-covered.
//   - Cross-run URL dedup: scans recent JSONL lines and skips events whose
//     URL was already recorded in the last ~10k entries.
//   - lastSweptAt write-back: when --queue used, the queue file is updated
//     with scanRunAt for every repo actually swept (anti-oscillation).
//   - JSONL compaction: 7-day retention enforced when --compact, --mode catchup,
//     or GITHUB_EVENT_SCHEDULE=="15 5 * * *" (the daily lane).

import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pLimit from "p-limit";

import {
  searchBluesky,
  searchDevto,
  searchHackerNews,
  searchLobsters,
  searchProductHunt,
  searchReddit,
  searchTavily,
  searchTwitter,
  ALL_CHANNELS,
} from "./_cross-source-search.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import { buildTwitterQueryBundle } from "@/lib/twitter/query-bundle";
import { createSession } from "./_bluesky-shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const TRENDING_FILE = resolve(DATA_DIR, "trending.json");
const REPO_METADATA_FILE = resolve(DATA_DIR, "repo-metadata.json");
const NPM_FILE = resolve(DATA_DIR, "npm-packages.json");
const PH_FILE = resolve(DATA_DIR, "producthunt-launches.json");
const LOBSTERS_FILE = resolve(DATA_DIR, "lobsters-trending.json");
const DETAIL_JSONL = resolve(DATA_DIR, "repo-mentions-detail.jsonl");
const ROLLUP_FILE = resolve(DATA_DIR, "repo-mentions-detail-rollup.json");

const SUPPORTED_SOURCES = ALL_CHANNELS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoInput {
  fullName: string;
  owner: string;
  name: string;
  packageNames: string[];
  aliases: string[];
  homepageUrl: string | null;
  description: string | null;
  rank: number | null;
  source: "trending" | "queue" | "manual";
}

interface Mention {
  source: string;
  fullName: string;
  url: string;
  title: string;
  text: string;
  author: string | null;
  engagement: { score?: number; comments?: number; reactions?: number };
  observedAt: string;
}

interface SweepEvent extends Mention {
  scanRunAt: string;
  scanRunId: string;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type SweepMode = "top" | "catchup";

interface Options {
  top: number;
  skip: number;
  repo: string | null;
  queue: string | null;
  sourceOnly: string | null;
  concurrency: number;
  dryRun: boolean;
  verbose: boolean;
  mode: SweepMode;
  compact: boolean;
}

function usage(): string {
  return [
    "usage: npm run sweep:mentions -- [--top N] [--queue path] [--repo owner/name]",
    "                                  [--source-only ch] [--concurrency N] [--mode top|catchup]",
    "                                  [--compact] [--dry-run]",
    "",
    "  --top N            number of top-trending repos to sweep (default 50)",
    "  --skip N           skip the first N trending entries (e.g. --skip 50 --top 50 = ranks 51-100)",
    "  --queue path       consume profile-completion-queue.json instead of top-N",
    "  --repo owner/name  sweep one specific repo (overrides --top / --queue)",
    "  --source-only ch   restrict to one of: " + SUPPORTED_SOURCES.join(", "),
    "  --concurrency N    parallel repo workers (default 4)",
    "  --mode m           sweep mode: top (default) or catchup (full-corpus reconciliation;",
    "                     ignores --top, used by daily 05:15 lane; forces JSONL compaction)",
    "  --compact          rewrite repo-mentions-detail.jsonl to last 7d after run",
    "  --dry-run          run adapters but do not write JSONL / Redis",
  ].join("\n");
}

function failUsage(message: string): never {
  console.error(`sweep-mentions: ${message}`);
  console.error(usage());
  process.exit(64);
}

function parseArgs(argv: string[]): Options {
  let top = 50;
  let skip = 0;
  let repo: string | null = null;
  let queue: string | null = null;
  let sourceOnly: string | null = null;
  let concurrency = 4;
  let dryRun = false;
  let verbose = false;
  let mode: SweepMode = "top";
  let compact = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--compact") {
      compact = true;
    } else if (arg === "--top") {
      top = positiveInt(argv[++i], "--top");
    } else if (arg.startsWith("--top=")) {
      top = positiveInt(arg.slice(6), "--top");
    } else if (arg === "--skip") {
      skip = nonNegativeInt(argv[++i], "--skip");
    } else if (arg.startsWith("--skip=")) {
      skip = nonNegativeInt(arg.slice(7), "--skip");
    } else if (arg === "--repo") {
      repo = requireString(argv[++i], "--repo");
    } else if (arg.startsWith("--repo=")) {
      repo = requireString(arg.slice(7), "--repo");
    } else if (arg === "--queue") {
      queue = requireString(argv[++i], "--queue");
    } else if (arg.startsWith("--queue=")) {
      queue = requireString(arg.slice(8), "--queue");
    } else if (arg === "--source-only") {
      sourceOnly = requireString(argv[++i], "--source-only");
    } else if (arg.startsWith("--source-only=")) {
      sourceOnly = requireString(arg.slice(14), "--source-only");
    } else if (arg === "--concurrency") {
      concurrency = positiveInt(argv[++i], "--concurrency");
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = positiveInt(arg.slice(14), "--concurrency");
    } else if (arg === "--mode") {
      mode = parseMode(argv[++i]);
    } else if (arg.startsWith("--mode=")) {
      mode = parseMode(arg.slice(7));
    } else {
      failUsage(`unknown argument: ${arg}`);
    }
  }
  if (sourceOnly && !SUPPORTED_SOURCES.includes(sourceOnly)) {
    failUsage(`--source-only must be one of: ${SUPPORTED_SOURCES.join(", ")}`);
  }
  return {
    top,
    skip,
    repo,
    queue,
    sourceOnly,
    concurrency,
    dryRun,
    verbose,
    mode,
    compact,
  };
}

function parseMode(raw: string | undefined): SweepMode {
  if (raw === "top" || raw === "catchup") return raw;
  failUsage(`--mode must be top|catchup, got ${raw ?? "<missing>"}`);
}

function positiveInt(raw: string | undefined, name: string): number {
  if (!raw) failUsage(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    failUsage(`${name} must be a positive integer, got ${raw}`);
  }
  return n;
}

function nonNegativeInt(raw: string | undefined, name: string): number {
  if (!raw) failUsage(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    failUsage(`${name} must be a non-negative integer, got ${raw}`);
  }
  return n;
}

function requireString(raw: string | undefined, name: string): string {
  if (!raw) failUsage(`${name} requires a value`);
  return raw;
}

// ---------------------------------------------------------------------------
// Repo loaders
// ---------------------------------------------------------------------------

interface TrendingRow {
  repo_id?: string;
  repo_name?: string;
  description?: string;
  primary_language?: string;
  stars?: string;
}

interface MetadataItem {
  fullName?: string;
  description?: string;
  homepageUrl?: string;
  url?: string;
}

interface NpmPackage {
  name?: string;
  linkedRepo?: string;
  homepage?: string;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
    throw err;
  }
}

function buildPackageIndex(packages: NpmPackage[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const pkg of packages) {
    if (!pkg?.linkedRepo || !pkg?.name) continue;
    const key = pkg.linkedRepo.toLowerCase();
    const list = map.get(key) ?? [];
    if (!list.includes(pkg.name)) list.push(pkg.name);
    map.set(key, list);
  }
  return map;
}

function buildMetadataIndex(items: MetadataItem[]): Map<string, MetadataItem> {
  const map = new Map<string, MetadataItem>();
  for (const item of items) {
    if (item?.fullName) map.set(item.fullName.toLowerCase(), item);
  }
  return map;
}

function repoFromTrending(
  row: TrendingRow,
  metadata: Map<string, MetadataItem>,
  packages: Map<string, string[]>,
  rank: number,
): RepoInput | null {
  if (!row?.repo_name?.includes("/")) return null;
  const [owner, name] = row.repo_name.split("/", 2);
  const meta = metadata.get(row.repo_name.toLowerCase());
  return {
    fullName: row.repo_name,
    owner,
    name,
    packageNames: packages.get(row.repo_name.toLowerCase()) ?? [],
    aliases: [],
    homepageUrl: meta?.homepageUrl ?? null,
    description: row.description ?? meta?.description ?? null,
    rank,
    source: "trending",
  };
}

function repoFromFullName(
  fullName: string,
  metadata: Map<string, MetadataItem>,
  packages: Map<string, string[]>,
  source: RepoInput["source"],
  rank: number | null = null,
): RepoInput | null {
  if (!fullName.includes("/")) return null;
  const [owner, name] = fullName.split("/", 2);
  const meta = metadata.get(fullName.toLowerCase());
  return {
    fullName,
    owner,
    name,
    packageNames: packages.get(fullName.toLowerCase()) ?? [],
    aliases: [],
    homepageUrl: meta?.homepageUrl ?? null,
    description: meta?.description ?? null,
    rank,
    source,
  };
}

interface QueueEntry {
  fullName: string;
  rank?: number | null;
  recommendedAction: "enrich" | "sweep" | "both" | "noop";
  priority?: number;
  lastSweptAt?: string | null;
}

const ANTI_OSC_HOURS = 6;

async function loadQueueRepos(
  queuePath: string,
  metadata: Map<string, MetadataItem>,
  packages: Map<string, string[]>,
  topN: number,
): Promise<RepoInput[]> {
  const data = await readJson<{ generatedAt?: string; incomplete?: QueueEntry[] }>(queuePath, {
    incomplete: [],
  });
  const generatedAt = Date.parse(data?.generatedAt ?? "");
  if (Number.isFinite(generatedAt) && Date.now() - generatedAt > 2 * 3600 * 1000) {
    console.warn(
      `[sweep] queue file ${queuePath} is stale (generatedAt=${data.generatedAt}) — falling back to trending top-N`,
    );
    return [];
  }
  const cutoff = Date.now() - ANTI_OSC_HOURS * 3600 * 1000;
  const eligible = (data.incomplete ?? [])
    .filter((e) => e.recommendedAction === "sweep" || e.recommendedAction === "both")
    .filter((e) => {
      const last = Date.parse(e.lastSweptAt ?? "");
      return !Number.isFinite(last) || last < cutoff;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, topN);
  console.log(
    `[sweep] queue: ${data.incomplete?.length ?? 0} total → ${eligible.length} eligible (sweep|both, age >${ANTI_OSC_HOURS}h)`,
  );
  return eligible
    .map((e) => repoFromFullName(e.fullName, metadata, packages, "queue", e.rank ?? null))
    .filter((r): r is RepoInput => r !== null);
}

async function loadTrendingTopN(
  topN: number,
  skip: number,
  metadata: Map<string, MetadataItem>,
  packages: Map<string, string[]>,
): Promise<RepoInput[]> {
  const data = await readJson<{
    buckets?: { past_24_hours?: { All?: TrendingRow[] } };
  }>(TRENDING_FILE, { buckets: {} });
  const rows = data.buckets?.past_24_hours?.All ?? [];
  const out: RepoInput[] = [];
  const seen = new Set<string>();
  let absoluteRank = 0;
  for (const row of rows) {
    if (!row?.repo_name?.includes("/")) continue;
    const key = row.repo_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    absoluteRank += 1;
    if (absoluteRank <= skip) continue;
    const repo = repoFromTrending(row, metadata, packages, absoluteRank);
    if (!repo) continue;
    out.push(repo);
    if (out.length >= topN) break;
  }
  return out;
}

// Catchup-mode loader — full corpus, no slice. Used by the daily 05:15 lane
// for one-shot reconciliation across every trending repo. Concurrency cap
// in main() still bounds wall-clock; this just removes the rank ceiling.
async function loadTrendingAll(
  metadata: Map<string, MetadataItem>,
  packages: Map<string, string[]>,
): Promise<RepoInput[]> {
  const data = await readJson<{
    buckets?: { past_24_hours?: { All?: TrendingRow[] } };
  }>(TRENDING_FILE, { buckets: {} });
  const rows = data.buckets?.past_24_hours?.All ?? [];
  const out: RepoInput[] = [];
  const seen = new Set<string>();
  let absoluteRank = 0;
  for (const row of rows) {
    if (!row?.repo_name?.includes("/")) continue;
    const key = row.repo_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    absoluteRank += 1;
    const repo = repoFromTrending(row, metadata, packages, absoluteRank);
    if (!repo) continue;
    out.push(repo);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Twitter query bundle adapter
// ---------------------------------------------------------------------------

function buildTwitterQueriesForRepo(repo: RepoInput): string[] {
  const queries = buildTwitterQueryBundle({
    repoId: repo.fullName,
    githubFullName: repo.fullName,
    githubUrl: `https://github.com/${repo.fullName}`,
    repoName: repo.name,
    ownerName: repo.owner,
    homepageUrl: repo.homepageUrl ?? null,
    docsUrl: null,
    packageNames: repo.packageNames,
    aliases: repo.aliases,
    description: repo.description ?? null,
  });
  // Tier 1 only by default — Apify per-query cost makes Tier 2/3 expensive
  // at top-50 × 4 sweeps/day. Keep the higher tiers for one-off
  // investigation runs, not the recurring sweep.
  return queries
    .filter((q) => q.tier === 1 && q.enabled)
    .map((q) => q.queryText);
}

// ---------------------------------------------------------------------------
// Adapter dispatch (per-repo, fail-soft)
// ---------------------------------------------------------------------------

interface SweepContext {
  blueskySession: { accessJwt: string } | null;
  lobstersSnapshot: unknown | null;
  productHuntSnapshot: unknown | null;
  tavilyKey: string | null;
  apifyToken: string | null;
  sourceOnly: string | null;
}

async function runRepo(repo: RepoInput, ctx: SweepContext): Promise<Mention[]> {
  const should = (ch: string) => !ctx.sourceOnly || ctx.sourceOnly === ch;
  const tasks: Array<Promise<Mention[]>> = [];

  if (should("twitter") && ctx.apifyToken) {
    const queries = buildTwitterQueriesForRepo(repo);
    tasks.push(
      searchTwitter(repo, queries, {
        token: ctx.apifyToken,
        tweetsPerQuery: tweetsPerQueryForRank(repo.rank),
      }),
    );
  }
  if (should("reddit")) tasks.push(searchReddit(repo));
  if (should("hackernews")) tasks.push(searchHackerNews(repo));
  if (should("bluesky")) tasks.push(searchBluesky(repo, ctx.blueskySession));
  if (should("devto")) tasks.push(searchDevto(repo));
  if (should("lobsters")) tasks.push(searchLobsters(repo, ctx.lobstersSnapshot));
  if (should("producthunt")) tasks.push(searchProductHunt(repo, ctx.productHuntSnapshot));
  if (should("tavily")) tasks.push(searchTavily(repo, ctx.tavilyKey));

  const results = await Promise.allSettled(tasks);
  const out: Mention[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rollup builder — top 5 per source per repo, last 7d
// ---------------------------------------------------------------------------

interface RollupSourceEntry {
  count7d: number;
  top: Mention[];
}

interface RollupRepoEntry {
  fullName: string;
  totalMentions7d: number;
  perSource: Record<string, RollupSourceEntry>;
}

interface RollupPayload {
  computedAt: string;
  scanRunId: string;
  windowDays: number;
  repos: Record<string, RollupRepoEntry>;
}

function buildRollup(
  events: SweepEvent[],
  scanRunId: string,
  windowDays = 7,
): RollupPayload {
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const repos: Record<string, RollupRepoEntry> = {};
  for (const ev of events) {
    const ts = Date.parse(ev.observedAt);
    if (Number.isFinite(ts) && ts < cutoff) continue;
    if (!repos[ev.fullName]) {
      repos[ev.fullName] = { fullName: ev.fullName, totalMentions7d: 0, perSource: {} };
    }
    const repo = repos[ev.fullName];
    if (!repo.perSource[ev.source]) {
      repo.perSource[ev.source] = { count7d: 0, top: [] };
    }
    const bucket = repo.perSource[ev.source];
    bucket.count7d += 1;
    repo.totalMentions7d += 1;
    bucket.top.push({
      source: ev.source,
      fullName: ev.fullName,
      url: ev.url,
      title: ev.title,
      text: ev.text,
      author: ev.author,
      engagement: ev.engagement,
      observedAt: ev.observedAt,
    });
  }
  // Trim each source bucket to top 5 by engagement.score desc, observedAt desc.
  for (const repo of Object.values(repos)) {
    for (const bucket of Object.values(repo.perSource)) {
      bucket.top.sort((a, b) => {
        const sd = (b.engagement?.score ?? 0) - (a.engagement?.score ?? 0);
        if (sd !== 0) return sd;
        return Date.parse(b.observedAt) - Date.parse(a.observedAt);
      });
      bucket.top = bucket.top.slice(0, 5);
    }
  }
  return {
    computedAt: new Date().toISOString(),
    scanRunId,
    windowDays,
    repos,
  };
}

// ---------------------------------------------------------------------------
// Bluesky session
// ---------------------------------------------------------------------------

async function tryBlueskySession(): Promise<{ accessJwt: string } | null> {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return null;
  try {
    const session = await createSession(handle, password);
    return session.accessJwt ? { accessJwt: session.accessJwt } : null;
  } catch (err) {
    console.warn(`[sweep] Bluesky session failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-rank Twitter depth — top repos earn deeper Apify pulls.
// ---------------------------------------------------------------------------
//
// Apify run-sync billing is per-tweet. Top-10 trending repos generate the
// bulk of the cross-source signal (and Twitter is by far the most expensive
// channel), so spending more there is correct. Long-tail repos at rank 200+
// rarely yield more than a couple tweets per Tier-1 query — capping at 10
// keeps the daily lane affordable without losing material recall.
function tweetsPerQueryForRank(rank: number | null): number {
  if (rank === null || !Number.isFinite(rank)) return 20;
  if (rank <= 10) return 50;
  if (rank <= 50) return 30;
  if (rank <= 200) return 20;
  return 10;
}

// ---------------------------------------------------------------------------
// JSONL housekeeping — cross-run dedup + 7-day compaction.
// ---------------------------------------------------------------------------

const RECENT_URL_TAIL_LINES = 10_000;
const COMPACTION_WINDOW_DAYS = 7;

// Load the URLs already present in roughly the last N lines of the JSONL
// so we can suppress duplicates from prior sweeps (different scanRunId,
// same canonical URL). Reading the entire 9MB+ file once at start is fine —
// 14k lines parses in ~50ms — but cap to RECENT_URL_TAIL_LINES to keep
// memory bounded once the file grows.
async function loadRecentUrlSet(jsonlPath: string): Promise<Set<string>> {
  const set = new Set<string>();
  let raw: string;
  try {
    raw = await readFile(jsonlPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return set;
    throw err;
  }
  const lines = raw.split("\n");
  // Drop trailing empty (file always ends with newline) before slicing.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const tail = lines.slice(Math.max(0, lines.length - RECENT_URL_TAIL_LINES));
  for (const line of tail) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { url?: unknown };
      if (typeof obj.url === "string" && obj.url) set.add(obj.url);
    } catch {
      // Skip malformed lines — a corrupt tail shouldn't block the sweep.
    }
  }
  return set;
}

// Atomically rewrite the JSONL keeping only events with observedAt within
// the last 7 days. Uses temp-file-then-rename so an interrupted run leaves
// the original file intact. Returns { kept, dropped } for logging.
async function compactJsonl(
  jsonlPath: string,
  windowDays: number,
): Promise<{ kept: number; dropped: number }> {
  let raw: string;
  try {
    raw = await readFile(jsonlPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { kept: 0, dropped: 0 };
    }
    throw err;
  }
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const lines = raw.split("\n");
  let kept = 0;
  let dropped = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    let observedAt: unknown;
    try {
      observedAt = (JSON.parse(line) as { observedAt?: unknown }).observedAt;
    } catch {
      // Drop malformed lines — they'd silently corrupt downstream readers.
      dropped += 1;
      continue;
    }
    const ts = typeof observedAt === "string" ? Date.parse(observedAt) : NaN;
    if (Number.isFinite(ts) && ts >= cutoff) {
      out.push(line);
      kept += 1;
    } else {
      dropped += 1;
    }
  }
  // Always end with a trailing newline so subsequent appendFile() lines start
  // on their own row.
  const body = out.length > 0 ? out.join("\n") + "\n" : "";
  const tmpPath = `${jsonlPath}.tmp-${process.pid}`;
  await writeFile(tmpPath, body, "utf8");
  await rename(tmpPath, jsonlPath);
  return { kept, dropped };
}

function shouldCompact(opts: Options): boolean {
  if (opts.compact) return true;
  if (opts.mode === "catchup") return true;
  // Daily 05:15 lane — workflow exposes the schedule via env var when run as
  // a cron action. The sweep workflow YAML branches on this same string.
  if (process.env.GITHUB_EVENT_SCHEDULE === "15 5 * * *") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Queue write-back — anti-oscillation half of the lastSweptAt contract.
// ---------------------------------------------------------------------------

interface QueueFile {
  generatedAt?: string;
  version?: number;
  mode?: string;
  totalChecked?: number;
  thresholdScore?: number;
  incomplete?: QueueEntry[];
  summary?: unknown;
}

// Re-read the queue file, stamp lastSweptAt = scanRunAt for every fullName
// in `sweptFullNames`, and write back. Skips the write entirely if nothing
// matched (defensive — same effect, no churn) or if the file vanished mid-run.
async function writeQueueLastSweptAt(
  queuePath: string,
  sweptFullNames: Set<string>,
  scanRunAt: string,
): Promise<{ updated: number }> {
  if (sweptFullNames.size === 0) return { updated: 0 };
  let raw: string;
  try {
    raw = await readFile(queuePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      console.warn(`[sweep] queue ${queuePath} vanished before write-back — skipping`);
      return { updated: 0 };
    }
    throw err;
  }
  let parsed: QueueFile;
  try {
    parsed = JSON.parse(raw) as QueueFile;
  } catch (err) {
    console.warn(
      `[sweep] queue ${queuePath} unreadable for write-back: ${err instanceof Error ? err.message : err}`,
    );
    return { updated: 0 };
  }
  let updated = 0;
  const incomplete = parsed.incomplete ?? [];
  for (const entry of incomplete) {
    if (sweptFullNames.has(entry.fullName)) {
      entry.lastSweptAt = scanRunAt;
      updated += 1;
    }
  }
  parsed.incomplete = incomplete;
  await writeFile(queuePath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return { updated };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const scanRunId = `sweep-${new Date().toISOString()}`;

  // Load context: metadata, packages, snapshots, sessions.
  const [metadataFile, npmFile, lobstersFile, phFile] = await Promise.all([
    readJson<{ items?: MetadataItem[] }>(REPO_METADATA_FILE, { items: [] }),
    readJson<{ packages?: NpmPackage[] }>(NPM_FILE, { packages: [] }),
    readJson<unknown>(LOBSTERS_FILE, null),
    readJson<unknown>(PH_FILE, null),
  ]);
  const metadata = buildMetadataIndex(metadataFile.items ?? []);
  const packages = buildPackageIndex(npmFile.packages ?? []);

  // Resolve target repos: --repo > --queue > top-N trending (or catchup → full).
  let repos: RepoInput[] = [];
  if (opts.repo) {
    const r = repoFromFullName(opts.repo, metadata, packages, "manual");
    if (!r) failUsage(`--repo must be owner/name, got ${opts.repo}`);
    repos = [r as RepoInput];
  } else if (opts.queue) {
    repos = await loadQueueRepos(opts.queue, metadata, packages, opts.top);
    if (repos.length === 0) {
      console.warn(`[sweep] queue empty / stale — falling back to trending top-${opts.top}`);
      repos = await loadTrendingTopN(opts.top, opts.skip, metadata, packages);
    }
  } else if (opts.mode === "catchup") {
    repos = await loadTrendingAll(metadata, packages);
    console.log(`[sweep] catchup mode: full corpus, ${repos.length} repos (--top/--skip ignored)`);
  } else {
    repos = await loadTrendingTopN(opts.top, opts.skip, metadata, packages);
  }

  if (repos.length === 0) {
    console.log("[sweep] no repos to sweep — exiting");
    return;
  }

  const blueskySession = await tryBlueskySession();
  const ctx: SweepContext = {
    blueskySession,
    lobstersSnapshot: lobstersFile,
    productHuntSnapshot: phFile,
    tavilyKey: process.env.TAVILY_API_KEY ?? null,
    apifyToken: process.env.APIFY_API_TOKEN ?? null,
    sourceOnly: opts.sourceOnly,
  };

  const channelLineup = (opts.sourceOnly ? [opts.sourceOnly] : SUPPORTED_SOURCES).join(",");
  console.log(
    `[sweep] start scanRunId=${scanRunId} repos=${repos.length} channels=[${channelLineup}] concurrency=${opts.concurrency} dryRun=${opts.dryRun}`,
  );
  if (!ctx.apifyToken && (!opts.sourceOnly || opts.sourceOnly === "twitter")) {
    console.warn("[sweep] APIFY_API_TOKEN missing — Twitter channel disabled");
  }
  if (!ctx.tavilyKey && (!opts.sourceOnly || opts.sourceOnly === "tavily")) {
    console.warn("[sweep] TAVILY_API_KEY missing — Tavily channel disabled");
  }
  if (!ctx.blueskySession && (!opts.sourceOnly || opts.sourceOnly === "bluesky")) {
    console.warn("[sweep] BLUESKY_HANDLE/BLUESKY_APP_PASSWORD missing — Bluesky channel disabled");
  }

  // Run repos through bounded queue.
  const limit = pLimit(opts.concurrency);
  const allEvents: SweepEvent[] = [];
  const perChannelCount: Record<string, number> = Object.create(null);
  let partialFailures = 0;

  await Promise.all(
    repos.map((repo) =>
      limit(async () => {
        try {
          const mentions = await runRepo(repo, ctx);
          const scanRunAt = new Date().toISOString();
          for (const m of mentions) {
            const ev: SweepEvent = { ...m, scanRunAt, scanRunId };
            allEvents.push(ev);
            perChannelCount[m.source] = (perChannelCount[m.source] ?? 0) + 1;
          }
          if (opts.verbose) {
            console.log(`  ${repo.fullName}: ${mentions.length} mentions across ${new Set(mentions.map((m) => m.source)).size} channels`);
          }
        } catch (err) {
          partialFailures += 1;
          console.warn(`[sweep] runRepo ${repo.fullName} failed: ${err instanceof Error ? err.message : err}`);
        }
      }),
    ),
  );

  const channelSummary = Object.entries(perChannelCount)
    .sort(([, a], [, b]) => b - a)
    .map(([ch, n]) => `${ch}=${n}`)
    .join(" ");
  const durationMs = Date.now() - startedAt;
  console.log(
    `[sweep] done events=${allEvents.length} repos=${repos.length} ${channelSummary} durationMs=${durationMs}`,
  );

  if (opts.dryRun) {
    console.log("[sweep] dry-run: skipping JSONL append + Redis dual-write");
    return;
  }

  // Cross-run URL dedup — drop events whose URL already lives in the recent
  // tail of the JSONL. Keeps successive sweeps (every 6h) from re-recording
  // the same tweet/post each time. Rollup still benefits because the dedup
  // preserves the FIRST-seen entry on disk; subsequent runs become no-ops
  // for unchanged URLs.
  const seenUrls = await loadRecentUrlSet(DETAIL_JSONL);
  let dedupSkipped = 0;
  const eventsToWrite: SweepEvent[] = [];
  for (const ev of allEvents) {
    if (ev.url && seenUrls.has(ev.url)) {
      dedupSkipped += 1;
      continue;
    }
    if (ev.url) seenUrls.add(ev.url);
    eventsToWrite.push(ev);
  }
  console.log(
    `[sweep] dedup: skipped=${dedupSkipped} (${allEvents.length} candidates → ${eventsToWrite.length} new)`,
  );

  // Append raw events to JSONL (post-dedup).
  if (eventsToWrite.length > 0) {
    await mkdir(dirname(DETAIL_JSONL), { recursive: true });
    const lines = eventsToWrite.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(DETAIL_JSONL, lines, "utf8");
  }

  // Build + write rollup. Merge with existing on-disk rollup so successive
  // runs (e.g. --top 50, then --skip 50 --top 50) accumulate coverage
  // instead of overwriting prior repos. New repos in this run replace any
  // prior entry (same fullName), preserving rest. Per-source freshness
  // within a repo is the latest run's view, which matches the JSONL's
  // append-only semantics.
  //
  // Rollup uses the FULL allEvents list (not eventsToWrite) — the rollup is
  // a snapshot, not a delta, so we want every event observed this run to
  // contribute to top-5 ranking even if its URL is already on disk.
  const rollup = buildRollup(allEvents, scanRunId);
  const previous = await readJson<{ repos?: Record<string, unknown> }>(ROLLUP_FILE, { repos: {} });
  const mergedRepos = { ...(previous.repos ?? {}), ...rollup.repos };
  const mergedRollup = { ...rollup, repos: mergedRepos };
  await writeFile(ROLLUP_FILE, JSON.stringify(mergedRollup, null, 2) + "\n", "utf8");
  const redisResult = await writeDataStore("repo-mentions-detail-rollup", mergedRollup);

  // lastSweptAt write-back — anti-oscillation half of the queue contract.
  // Stamp every fullName actually swept this run so the next queue load
  // skips them until ANTI_OSC_HOURS has elapsed.
  let queueUpdated = 0;
  if (opts.queue) {
    const sweptFullNames = new Set(repos.map((r) => r.fullName));
    const scanRunAt = new Date().toISOString();
    const result = await writeQueueLastSweptAt(opts.queue, sweptFullNames, scanRunAt);
    queueUpdated = result.updated;
    console.log(`[sweep] queue write-back: updated lastSweptAt for ${queueUpdated} entries in ${opts.queue}`);
  }

  // JSONL compaction — 7-day retention. Triggered by --compact, --mode catchup,
  // or the daily 05:15 lane. Rewrites atomically (temp + rename) so a crash
  // mid-run can't truncate the on-disk log.
  let compaction: { kept: number; dropped: number } | null = null;
  if (shouldCompact(opts)) {
    compaction = await compactJsonl(DETAIL_JSONL, COMPACTION_WINDOW_DAYS);
    console.log(
      `[sweep] compaction: kept=${compaction.kept} dropped=${compaction.dropped} (window=${COMPACTION_WINDOW_DAYS}d)`,
    );
  }

  await writeSourceMetaFromOutcome({
    source: "cross-source-mentions",
    count: allEvents.length,
    durationMs,
    error: undefined,
    partialFailures,
    extra: {
      scanRunId,
      repos: repos.length,
      perChannel: perChannelCount,
      sourceOnly: opts.sourceOnly,
      mode:
        opts.queue
          ? "queue"
          : opts.repo
            ? "single-repo"
            : opts.mode === "catchup"
              ? "catchup"
              : "top-trending",
      dedupSkipped,
      queueUpdated,
      compaction,
    },
  });

  console.log(
    `[sweep] wrote ${ROLLUP_FILE} (repos=${Object.keys(rollup.repos).length}) [redis: ${redisResult.source}]`,
  );
}

process.on("SIGINT", () => process.exit(130));

main()
  .catch((err) => {
    console.error("sweep-cross-source-mentions failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
