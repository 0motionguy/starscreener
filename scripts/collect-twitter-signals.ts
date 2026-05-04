#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { loadEnvConfig } from "@next/env";
import {
  buildTwitterCollectorPayload,
  DEFAULT_NITTER_INSTANCES,
  extractNitterNextPageUrl,
  isInstanceHealthy,
  nitterSearchUrls,
  normalizeNitterInstances,
  parseNitterHtml,
  parseNitterRss,
  rankRawPosts,
  recordInstanceFailure,
  recordInstanceSuccess,
  type CollectorRawPost,
} from "./_twitter-collector";
import {
  loadAccountsFromEnv as loadTwitterWebAccountsFromEnv,
  TwitterWebProvider,
  type TwitterWebPost,
} from "./_twitter-web-provider";
import { extractUnknownRepoCandidates } from "./_github-repo-links.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";
import { writeSourceMeta } from "./_data-meta.mjs";

// Brand-migration shim: prefer the new TRENDINGREPO_* env name, fall back
// to the legacy STARSCREENER_*. Inlined here (no warn) because scripts run
// in CI; the deprecation chatter belongs in the app's boot path.
const readEnv = (newName: string, oldName: string): string | undefined =>
  process.env[newName] ?? process.env[oldName];
import {
  buildTwitterQueryBundle,
  getTwitterScanCandidates,
  ingestTwitterAgentFindings,
} from "../src/lib/twitter/service";
import { ensureTwitterReady, flushTwitterPersist } from "../src/lib/twitter/storage";
import { getRepoMetadata, listRepoMetadata, type RepoMetadata } from "../src/lib/repo-metadata";
import { slugToId } from "../src/lib/utils";
import { scrapeTwitterFor } from "../src/lib/pool/twitter-fallback";
import type {
  TwitterIngestRequest,
  TwitterQuery,
  TwitterScanCandidate,
} from "../src/lib/twitter/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

loadEnvConfig(ROOT);

const USER_AGENT = "TrendingRepo-TwitterCollector/0.1 (+https://trendingrepo.com)";
const DEFAULT_BASE_URL = "http://localhost:3023";

type CollectorProvider = "nitter" | "fixture" | "web" | "apify";
type CollectorMode = "direct" | "api";

interface CliOptions {
  provider: CollectorProvider;
  mode: CollectorMode;
  baseUrl: string;
  token: string | null;
  limit: number;
  queriesPerRepo: number;
  postsPerRepo: number;
  postsPerQuery: number;
  nitterPages: number;
  windowHours: number;
  delayMs: number;
  timeoutMs: number;
  maxTier: number;
  repoFilters: string[];
  nitterInstances: string[];
  includeAliases: boolean;
  dryRun: boolean;
  ingestEmpty: boolean;
  output: string | null;
  fixtureFile: string | null;
  runId: string;
}

interface FetchTextOptions {
  timeoutMs: number;
  headers?: Record<string, string>;
}

function log(message: string): void {
  console.log(`[twitter-collector] ${message}`);
}

interface LogEvent {
  event: string;
  runId: string;
  timestamp: string;
  [key: string]: unknown;
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  const entry: LogEvent = {
    event,
    runId: process.env.TWITTER_COLLECTOR_RUN_ID ?? "unknown",
    timestamp: new Date().toISOString(),
    ...fields,
  };
  console.log(JSON.stringify(entry));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseIntegerFlag(
  value: string | undefined,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`expected integer between ${min} and ${max}, got ${value}`);
  }
  return parsed;
}

function takeFlagValue(args: string[], index: number): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${args[index]}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = {
    // Defaults reflect the only working production path per CLAUDE.md.
    // Nitter is dead post-2026 anti-bot; Apify is the supported provider.
    // `api` mode silently fails on Vercel's ephemeral filesystem; `direct`
    // is the GH-Actions-tested write path. Local invocations now match.
    provider: (process.env.TWITTER_COLLECTOR_PROVIDER as CollectorProvider) || "apify",
    mode: (process.env.TWITTER_COLLECTOR_MODE as CollectorMode) || "direct",
    baseUrl:
      process.env.TWITTER_COLLECTOR_BASE_URL ||
      readEnv("TRENDINGREPO_URL", "STARSCREENER_URL") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      DEFAULT_BASE_URL,
    token:
      process.env.INTERNAL_AGENT_TOKEN ||
      process.env.TWITTER_COLLECTOR_TOKEN ||
      process.env.CRON_SECRET ||
      null,
    limit: parseIntegerFlag(process.env.TWITTER_COLLECTOR_LIMIT, 25, {
      min: 1,
      max: 100,
    }),
    queriesPerRepo: parseIntegerFlag(process.env.TWITTER_COLLECTOR_QUERIES_PER_REPO, 4, {
      min: 1,
      max: 20,
    }),
    postsPerRepo: parseIntegerFlag(process.env.TWITTER_COLLECTOR_POSTS_PER_REPO, 0, {
      min: 0,
      max: 5000,
    }),
    postsPerQuery: parseIntegerFlag(process.env.TWITTER_COLLECTOR_POSTS_PER_QUERY, 0, {
      min: 0,
      max: 5000,
    }),
    nitterPages: parseIntegerFlag(process.env.TWITTER_COLLECTOR_NITTER_PAGES, 3, {
      min: 0,
      max: 50,
    }),
    windowHours: parseIntegerFlag(process.env.TWITTER_COLLECTOR_WINDOW_HOURS, 24, {
      min: 1,
      max: 168,
    }),
    delayMs: parseIntegerFlag(process.env.TWITTER_COLLECTOR_DELAY_MS, 800, {
      min: 0,
      max: 60_000,
    }),
    timeoutMs: parseIntegerFlag(process.env.TWITTER_COLLECTOR_TIMEOUT_MS, 12_000, {
      min: 1_000,
      max: 120_000,
    }),
    maxTier: parseIntegerFlag(process.env.TWITTER_COLLECTOR_MAX_TIER, 2, {
      min: 1,
      max: 3,
    }),
    repoFilters: (process.env.TWITTER_COLLECTOR_REPOS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    nitterInstances: normalizeNitterInstances(process.env.TWITTER_NITTER_INSTANCES),
    includeAliases: process.env.TWITTER_COLLECTOR_INCLUDE_ALIASES === "true",
    dryRun: process.env.TWITTER_COLLECTOR_DRY_RUN === "true",
    ingestEmpty: process.env.TWITTER_COLLECTOR_INGEST_EMPTY === "true",
    output: process.env.TWITTER_COLLECTOR_OUTPUT || null,
    fixtureFile: process.env.TWITTER_COLLECTOR_FIXTURE || null,
    runId: process.env.TWITTER_COLLECTOR_RUN_ID || `twitter-collector-${new Date().toISOString()}`,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--provider") {
      out.provider = takeFlagValue(argv, i) as CollectorProvider;
      i += 1;
    } else if (arg === "--mode") {
      out.mode = takeFlagValue(argv, i) as CollectorMode;
      i += 1;
    } else if (arg === "--base-url") {
      out.baseUrl = takeFlagValue(argv, i).replace(/\/+$/, "");
      i += 1;
    } else if (arg === "--limit") {
      out.limit = parseIntegerFlag(takeFlagValue(argv, i), out.limit, { min: 1, max: 100 });
      i += 1;
    } else if (arg === "--queries-per-repo") {
      out.queriesPerRepo = parseIntegerFlag(takeFlagValue(argv, i), out.queriesPerRepo, {
        min: 1,
        max: 20,
      });
      i += 1;
    } else if (arg === "--posts-per-repo") {
      out.postsPerRepo = parseIntegerFlag(takeFlagValue(argv, i), out.postsPerRepo, {
        min: 0,
        max: 5000,
      });
      i += 1;
    } else if (arg === "--posts-per-query") {
      out.postsPerQuery = parseIntegerFlag(takeFlagValue(argv, i), out.postsPerQuery, {
        min: 0,
        max: 5000,
      });
      i += 1;
    } else if (arg === "--nitter-pages") {
      out.nitterPages = parseIntegerFlag(takeFlagValue(argv, i), out.nitterPages, {
        min: 0,
        max: 50,
      });
      i += 1;
    } else if (arg === "--window-hours") {
      out.windowHours = parseIntegerFlag(takeFlagValue(argv, i), out.windowHours, {
        min: 1,
        max: 168,
      });
      i += 1;
    } else if (arg === "--delay-ms") {
      out.delayMs = parseIntegerFlag(takeFlagValue(argv, i), out.delayMs, {
        min: 0,
        max: 60_000,
      });
      i += 1;
    } else if (arg === "--timeout-ms") {
      out.timeoutMs = parseIntegerFlag(takeFlagValue(argv, i), out.timeoutMs, {
        min: 1_000,
        max: 120_000,
      });
      i += 1;
    } else if (arg === "--max-tier") {
      out.maxTier = parseIntegerFlag(takeFlagValue(argv, i), out.maxTier, {
        min: 1,
        max: 3,
      });
      i += 1;
    } else if (arg === "--repo") {
      out.repoFilters.push(takeFlagValue(argv, i).trim().toLowerCase());
      i += 1;
    } else if (arg === "--nitter-instances") {
      out.nitterInstances = normalizeNitterInstances(takeFlagValue(argv, i));
      i += 1;
    } else if (arg === "--include-aliases") {
      out.includeAliases = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--ingest-empty") {
      out.ingestEmpty = true;
    } else if (arg === "--output") {
      out.output = takeFlagValue(argv, i);
      i += 1;
    } else if (arg === "--fixture-file") {
      out.fixtureFile = takeFlagValue(argv, i);
      i += 1;
    } else if (arg === "--run-id") {
      out.runId = takeFlagValue(argv, i);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (
    out.provider !== "nitter" &&
    out.provider !== "fixture" &&
    out.provider !== "web" &&
    out.provider !== "apify"
  ) {
    throw new Error(`unsupported provider: ${out.provider}`);
  }
  if (out.mode !== "direct" && out.mode !== "api") {
    throw new Error(`unsupported mode: ${out.mode}`);
  }
  if (out.provider === "fixture" && !out.fixtureFile) {
    throw new Error("fixture provider requires --fixture-file");
  }

  return out;
}

function printHelp(): void {
  console.log(`Usage: npm run collect:twitter -- [options]

Options:
  --provider apify|fixture        Source provider. Default: apify (the only
                                  working production path; nitter + web are
                                  retained for offline replay only).
  --mode direct|api               Direct writes JSONL via service; api posts
                                  to running app. Default: direct (api silently
                                  fails on Vercel's ephemeral filesystem).
  --limit N                       Candidate repos to scan. Default: 25
  --queries-per-repo N            Query cap per repo. Default: 4
  --posts-per-query N             Accepted source posts per query. 0 = all returned posts. Default: 0
  --posts-per-repo N              Ingested posts per repo. 0 = all matched posts. Default: 0
  --nitter-pages N                HTML search pages per query. 0 = crawl until no next page, safety max 50. Default: 3
  --window-hours N                Freshness window. Default: 24
  --max-tier 1|2|3                Highest query tier to run. Default: 2
  --repo owner/name               Restrict collection to one repo. Repeatable
  --nitter-instances a,b,c        Comma-separated Nitter instance bases (legacy)
  --include-aliases               Include tier-3 alias queries
  --dry-run                       Build payloads without ingesting
  --ingest-empty                  Write zero-post scans too
  --output path                   Write built payloads as JSON for review
  --fixture-file path             Provider fixture input

Default Nitter instances (legacy, only used when --provider nitter):
  ${DEFAULT_NITTER_INSTANCES.join(", ")}
`);
}

async function fetchText(url: string, options: FetchTextOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function dedupeRawPosts(posts: CollectorRawPost[]): CollectorRawPost[] {
  const byPost = new Map<string, CollectorRawPost>();

  for (const post of posts) {
    const key = post.postId || post.postUrl || `${post.authorHandle}:${post.text}`;
    if (!byPost.has(key)) {
      byPost.set(key, post);
    }
  }

  return Array.from(byPost.values());
}

function capQueryPosts(
  posts: CollectorRawPost[],
  options: CliOptions,
): CollectorRawPost[] {
  const ranked = rankRawPosts(dedupeRawPosts(posts));
  return options.postsPerQuery > 0
    ? ranked.slice(0, options.postsPerQuery)
    : ranked;
}

function selectQueries(
  candidate: TwitterScanCandidate,
  options: CliOptions,
): TwitterQuery[] {
  return buildTwitterQueryBundle(candidate.repo)
    .filter((query) => query.enabled)
    .filter((query) => query.tier <= options.maxTier)
    .filter((query) => options.includeAliases || query.tier < 3)
    .slice(0, options.queriesPerRepo);
}

function searchTextsForQuery(query: TwitterQuery): string[] {
  if (query.queryType === "repo_slug") {
    return [`"${query.queryText}"`];
  }
  if (query.queryType === "repo_url") {
    try {
      const url = new URL(query.queryText);
      const normalized = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`;
      return [`"${normalized}"`];
    } catch {
      return [`"${query.queryText.replace(/^https?:\/\//, "").replace(/\/+$/, "")}"`];
    }
  }
  return [query.queryText];
}

async function loadCandidatesFromApi(options: CliOptions): Promise<TwitterScanCandidate[]> {
  const limit = options.repoFilters.length > 0 ? 100 : options.limit;
  const url = `${options.baseUrl.replace(/\/+$/, "")}/api/internal/signals/twitter/v1/candidates?limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`candidate API failed: HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { candidates?: TwitterScanCandidate[] };
  return body.candidates ?? [];
}

function filterCandidatesByRepo(
  candidates: TwitterScanCandidate[],
  repoFilters: string[],
): TwitterScanCandidate[] {
  if (repoFilters.length === 0) return candidates;
  const wanted = new Set(repoFilters);
  return candidates.filter((candidate) => {
    const fullName = candidate.repo.githubFullName.toLowerCase();
    const repoId = candidate.repo.repoId.toLowerCase();
    return wanted.has(fullName) || wanted.has(repoId);
  });
}

function candidateFromMetadata(
  metadata: RepoMetadata,
  priorityRank: number,
): TwitterScanCandidate {
  return {
    priorityRank,
    priorityScore: 0,
    priorityReason: "explicit --repo target",
    lastScannedAt: null,
    repo: {
      repoId: slugToId(metadata.fullName),
      githubFullName: metadata.fullName,
      githubUrl: metadata.url,
      repoName: metadata.name,
      ownerName: metadata.owner,
      homepageUrl: null,
      docsUrl: null,
      packageNames: [],
      aliases: [metadata.name],
      description: metadata.description || null,
    },
  };
}

function findRepoMetadata(filter: string): RepoMetadata | null {
  const byFullName = getRepoMetadata(filter);
  if (byFullName) return byFullName;
  return (
    listRepoMetadata().find((metadata) => slugToId(metadata.fullName).toLowerCase() === filter) ??
    null
  );
}

async function collectNitterHtmlPages(
  firstUrl: string,
  query: TwitterQuery,
  options: CliOptions,
): Promise<CollectorRawPost[]> {
  const posts: CollectorRawPost[] = [];
  const seenUrls = new Set<string>();
  const maxPages = options.nitterPages === 0 ? 50 : options.nitterPages;
  let nextUrl: string | null = firstUrl;

  for (let page = 0; nextUrl && page < maxPages; page += 1) {
    if (seenUrls.has(nextUrl)) break;
    seenUrls.add(nextUrl);

    let body: string;
    try {
      body = await fetchText(nextUrl, { timeoutMs: options.timeoutMs });
    } catch (error) {
      if (posts.length > 0) break;
      throw error;
    }

    posts.push(...parseNitterHtml(body, nextUrl));

    if (options.postsPerQuery > 0 && dedupeRawPosts(posts).length >= options.postsPerQuery) {
      break;
    }

    nextUrl = extractNitterNextPageUrl(body, nextUrl);
    if (nextUrl && options.delayMs > 0) {
      await sleep(Math.min(options.delayMs, 2_000));
    }
  }

  logEvent("query_pages_done", {
    query: query.queryText,
    queryType: query.queryType,
    pagesFetched: seenUrls.size,
    postsSeen: posts.length,
  });

  return capQueryPosts(posts, options);
}

async function loadCandidates(options: CliOptions): Promise<TwitterScanCandidate[]> {
  const candidates =
    options.mode === "api"
      ? await loadCandidatesFromApi(options)
      : await getTwitterScanCandidates(options.repoFilters.length > 0 ? 100 : options.limit);
  const filtered = filterCandidatesByRepo(candidates, options.repoFilters);
  if (options.mode === "direct" && options.repoFilters.length > 0) {
    for (const filter of options.repoFilters) {
      const alreadyIncluded = filtered.some((candidate) => {
        const fullName = candidate.repo.githubFullName.toLowerCase();
        const repoId = candidate.repo.repoId.toLowerCase();
        return filter === fullName || filter === repoId;
      });
      if (alreadyIncluded) continue;

      const metadata = findRepoMetadata(filter);
      if (metadata && metadata.fullName && metadata.url && !metadata.archived && !metadata.disabled) {
        filtered.push(candidateFromMetadata(metadata, filtered.length + 1));
      }
    }
  }
  if (options.repoFilters.length > 0 && filtered.length === 0) {
    throw new Error(`no scan candidates matched --repo ${options.repoFilters.join(", ")}`);
  }
  return filtered;
}

async function collectFromNitter(
  query: TwitterQuery,
  options: CliOptions,
): Promise<CollectorRawPost[]> {
  const errors: string[] = [];

  for (const instance of options.nitterInstances) {
    if (!isInstanceHealthy(instance)) {
      errors.push(`${instance}: circuit breaker open`);
      continue;
    }

    let instanceSucceeded = false;

    for (const searchText of searchTextsForQuery(query)) {
      const urls = nitterSearchUrls(instance, searchText);
      for (const url of urls) {
        try {
          const posts = url.includes("/rss")
            ? capQueryPosts(
                parseNitterRss(
                  await fetchText(url, { timeoutMs: options.timeoutMs }),
                  url,
                ),
                options,
              )
            : await collectNitterHtmlPages(url, query, options);
          if (posts.length > 0) {
            recordInstanceSuccess(instance);
            instanceSucceeded = true;
            return posts;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${url}: ${message}`);
        }
        if (options.delayMs > 0) await sleep(Math.min(options.delayMs, 2_000));
      }
    }

    if (!instanceSucceeded) {
      recordInstanceFailure(instance);
    }
  }

  if (errors.length > 0) {
    logEvent("query_no_hits", {
      query: query.queryText,
      queryType: query.queryType,
      reason: errors[0],
    });
  }
  return [];
}

function webPostToRawPost(post: TwitterWebPost): CollectorRawPost {
  return {
    postId: post.id,
    postUrl: post.url,
    authorHandle: post.authorHandle,
    authorAvatarUrl: null,
    postedAt: post.postedAt,
    text: post.content,
    likes: post.likeCount,
    reposts: post.repostCount,
    replies: post.replyCount,
    quotes: post.quoteCount,
    sourceUrl: "https://api.x.com/graphql/SearchTimeline",
    ...(post.expandedUrls && post.expandedUrls.length > 0
      ? { expandedUrls: post.expandedUrls }
      : {}),
  };
}

function searchQueryForWeb(query: TwitterQuery): string {
  if (query.queryType === "repo_slug") {
    return `"${query.queryText}"`;
  }
  if (query.queryType === "repo_url") {
    try {
      const url = new URL(query.queryText);
      const normalized = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`;
      return `"${normalized}"`;
    } catch {
      return `"${query.queryText.replace(/^https?:\/\//, "").replace(/\/+$/, "")}"`;
    }
  }
  return query.queryText;
}

async function collectFromWeb(
  provider: TwitterWebProvider,
  query: TwitterQuery,
  options: CliOptions,
): Promise<CollectorRawPost[]> {
  const sinceMs = Date.now() - options.windowHours * 60 * 60 * 1000;
  const sinceISO = new Date(sinceMs).toISOString();
  const searchQuery = searchQueryForWeb(query);
  const limit = options.postsPerQuery > 0 ? Math.min(options.postsPerQuery, 100) : 25;

  try {
    const posts = await provider.search({
      query: searchQuery,
      sinceISO,
      limit,
    });
    const mapped = posts.map(webPostToRawPost);
    return capQueryPosts(mapped, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("query_no_hits", {
      query: query.queryText,
      queryType: query.queryType,
      reason: `web-provider: ${message}`,
    });
    throw error;
  }
}

async function collectFromApify(
  query: TwitterQuery,
  options: CliOptions,
): Promise<CollectorRawPost[]> {
  const sinceMs = Date.now() - options.windowHours * 60 * 60 * 1000;
  const sinceISO = new Date(sinceMs).toISOString();
  const searchQuery = searchQueryForWeb(query);
  const limit = options.postsPerQuery > 0 ? Math.min(options.postsPerQuery, 100) : 25;

  try {
    const posts = await scrapeTwitterFor(searchQuery, {
      query: searchQuery,
      sinceISO,
      limit,
      timeoutMs: options.timeoutMs,
    });
    const mapped = posts.map(webPostToRawPost);
    return capQueryPosts(mapped, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("query_no_hits", {
      query: query.queryText,
      queryType: query.queryType,
      reason: `apify-provider: ${message}`,
    });
    throw error;
  }
}

async function loadFixturePosts(path: string): Promise<CollectorRawPost[]> {
  const resolved = resolve(ROOT, path);
  const raw = JSON.parse(await readFile(resolved, "utf8")) as unknown;
  if (Array.isArray(raw)) return raw as CollectorRawPost[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { posts?: unknown }).posts)) {
    return (raw as { posts: CollectorRawPost[] }).posts;
  }
  throw new Error(`fixture file must be an array or { posts: [] }: ${resolved}`);
}

function fixturePostsForQuery(
  fixturePosts: CollectorRawPost[],
  query: TwitterQuery,
  candidate: TwitterScanCandidate,
): CollectorRawPost[] {
  const terms = [
    query.queryText.replace(/^"+|"+$/g, ""),
    candidate.repo.githubFullName,
    candidate.repo.githubUrl,
    `github.com/${candidate.repo.githubFullName}`,
    candidate.repo.repoName,
    ...(candidate.repo.packageNames ?? []),
    ...(candidate.repo.aliases ?? []),
  ]
    .map((value) => value.toLowerCase())
    .filter(Boolean);

  return fixturePosts
    .filter((post) => terms.some((term) => post.text.toLowerCase().includes(term)))
    .slice(0, 100);
}

async function postPayloadToApi(
  payload: TwitterIngestRequest,
  options: CliOptions,
): Promise<void> {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/api/internal/signals/twitter/v1/ingest`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ingest API failed for ${payload.repo.githubFullName}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

async function ingestPayload(
  payload: TwitterIngestRequest,
  options: CliOptions,
): Promise<"ingested" | "skipped" | "dry-run"> {
  if (options.dryRun) return "dry-run";
  if (payload.posts.length === 0 && !options.ingestEmpty) {
    return "skipped";
  }
  if (options.mode === "api") {
    await postPayloadToApi(payload, options);
    return "ingested";
  }
  await ingestTwitterAgentFindings(payload, "twitter_collector_cli");
  return "ingested";
}

async function writeOutput(path: string, payloads: TwitterIngestRequest[]): Promise<void> {
  const resolved = resolve(ROOT, path);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(payloads, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const startedMs = Date.now();
  const options = parseArgs(process.argv.slice(2));
  process.env.TWITTER_COLLECTOR_RUN_ID = options.runId;

  // CRITICAL FIX 2026-05-03: hydrate the in-memory store from the existing
  // .data/twitter-*.jsonl files BEFORE any ingest. Without this, each GH
  // Actions run starts with an empty memory store, ingests N new findings,
  // then `persist()` overwrites the JSONL files with only those N records.
  // The bug had been silently truncating .data/twitter-*.jsonl every cron
  // tick — file went from 490+ lines on 2026-04-23 to 15 lines/run since.
  // git diff saw the same N lines repeating each run and skipped commit,
  // so the workflow looked green but data was 10 days frozen.
  await ensureTwitterReady();

  const candidates = await loadCandidates(options);
  const fixturePosts =
    options.provider === "fixture" && options.fixtureFile
      ? await loadFixturePosts(options.fixtureFile)
      : [];

  let webProvider: TwitterWebProvider | null = null;
  if (options.provider === "web") {
    const accounts = loadTwitterWebAccountsFromEnv();
    webProvider = new TwitterWebProvider({
      accounts,
      timeoutMs: options.timeoutMs,
    });
    log(`web-provider initialized with ${accounts.length} account(s)`);
  }

  const payloads: TwitterIngestRequest[] = [];

  log(
    `provider=${options.provider} mode=${options.mode} candidates=${candidates.length} dryRun=${options.dryRun}`,
  );

  const limit = pLimit(2); // max 2 concurrent queries per repo

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const queries = selectQueries(candidate, options);
    const postsByQuery = new Map<string, CollectorRawPost[]>();

    logEvent("repo_start", {
      repo: candidate.repo.githubFullName,
      repoIndex: i + 1,
      repoTotal: candidates.length,
      queries: queries.length,
    });

    const queryStart = Date.now();
    let repoWebExhausted = false;
    await Promise.all(
      queries.map((query) =>
        limit(async () => {
          let posts: CollectorRawPost[] = [];
          if (options.provider === "fixture") {
            posts = fixturePostsForQuery(fixturePosts, query, candidate);
          } else if (options.provider === "web" && webProvider) {
            if (repoWebExhausted) {
              posts = [];
            } else {
              try {
                posts = await collectFromWeb(webProvider, query, options);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log(
                  `web-provider exhausted for ${candidate.repo.githubFullName}: ${message} — skipping remaining queries for this repo`,
                );
                repoWebExhausted = true;
                posts = [];
              }
            }
          } else if (options.provider === "apify") {
            if (repoWebExhausted) {
              posts = [];
            } else {
              try {
                posts = await collectFromApify(query, options);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log(
                  `apify-provider error for ${candidate.repo.githubFullName}: ${message} — skipping remaining queries for this repo`,
                );
                repoWebExhausted = true;
                posts = [];
              }
            }
          } else {
            posts = await collectFromNitter(query, options);
          }
          postsByQuery.set(query.queryText, posts);
          logEvent("query_done", {
            repo: candidate.repo.githubFullName,
            queryType: query.queryType,
            query: query.queryText,
            posts: posts.length,
            durationMs: Date.now() - queryStart,
          });
        }),
      ),
    );

    const payload = buildTwitterCollectorPayload(candidate, queries, postsByQuery, {
      agentName: "trendingrepo-twitter-collector",
      agentVersion: "0.1.0",
      runId: options.runId,
      triggeredBy: "scheduled_refresh",
      windowHours: options.windowHours,
      postsPerRepo: options.postsPerRepo,
    });
    payloads.push(payload);
    const ingestStatus = await ingestPayload(payload, options);

    logEvent("repo_done", {
      repo: candidate.repo.githubFullName,
      ingestStatus,
      postsIngested: payload.posts.length,
      durationMs: Date.now() - queryStart,
    });
  }

  if (options.output) {
    await writeOutput(options.output, payloads);
    log(`wrote ${options.output}`);
  }

  if (!options.dryRun && options.mode === "direct") {
    await flushTwitterPersist();
  }

  // Diagnostic for AUDIT-2026-05-04: .data/twitter-*.jsonl was frozen at
  // 2026-04-23 while the workflow ran green hourly. With this line the GHA
  // log shows whether new lines accrued (>0) or whether Apify returned an
  // empty set (=0). Helps decide between dedupe-bug vs upstream-stuck.
  const flushScans = payloads.length;
  const flushPosts = payloads.reduce((sum, p) => sum + p.posts.length, 0);
  console.error(
    `[twitter-collector] FLUSH SUMMARY repoSignals=${flushScans} scans=${flushScans} posts=${flushPosts} dryRun=${options.dryRun} mode=${options.mode}`,
  );

  const postCount = payloads.reduce((sum, payload) => sum + payload.posts.length, 0);
  if (webProvider) {
    const stats = webProvider.getStats();
    log(
      `web-provider stats requests=${stats.requests} errors=${stats.errors} healthy=${stats.accountsHealthy} rateLimited=${stats.accountsRateLimited}`,
    );
  }
  log(`done payloads=${payloads.length} posts=${postCount}`);

  // F3 unknown-mentions lake — Twitter is the highest-volume mention source;
  // every github URL we see in tweet text becomes a discovery candidate.
  // Walk all collected posts across all payloads and feed the lake. We walk
  // both `text` (catches bare github.com mentions) AND `expandedUrls`
  // (catches t.co-shortened links: tweet text shows the t.co form which
  // doesn't pattern-match github.com, but Apify's entities.urls[].expanded_url
  // resolves them).
  const unknownsAccumulator = new Set<string>();
  for (const payload of payloads) {
    for (const post of payload.posts ?? []) {
      const text = String((post as { text?: unknown }).text ?? "");
      for (const u of extractUnknownRepoCandidates(text, null) as Set<string>) {
        unknownsAccumulator.add(u);
      }
      const expanded = (post as { expandedUrls?: unknown }).expandedUrls;
      if (Array.isArray(expanded)) {
        for (const u of expanded) {
          if (typeof u !== "string" || !u) continue;
          for (const cand of extractUnknownRepoCandidates(u, null) as Set<string>) {
            unknownsAccumulator.add(cand);
          }
        }
      }
    }
  }
  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "twitter", fullName })),
    );
    log(`lake: ${unknownsAccumulator.size} candidates → data/unknown-mentions.jsonl`);
  }

  // I2 — emit data/_meta/twitter.json so the audit-freshness gate can detect
  // a broken Apify actor (key reason: cookie-based providers are dead and
  // Apify is the SPOF). Reason classification:
  //   - "ok"            payloads.length > 0 AND postCount > 0
  //   - "empty_results" payloads.length > 0 AND postCount === 0 (quiet day)
  //   - "partial"       no payloads emitted (every candidate failed)
  await writeSourceMeta({
    source: "twitter",
    reason:
      payloads.length === 0
        ? "partial"
        : postCount === 0
          ? "empty_results"
          : "ok",
    count: postCount,
    durationMs: Date.now() - startedMs,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
