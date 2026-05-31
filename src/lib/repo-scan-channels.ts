// Per-drop scan expansion — Track 5 of the DORP plan.
//
// PROBLEM
//   The screenshot promises "scan 30 sources for cross-source signal". The
//   pre-existing intake (`pipeline.ingestRepo`) only covers the 8 social
//   channels (Twitter, Reddit, HN, Bluesky, dev.to, Lobsters, ProductHunt,
//   Tavily). The remaining signal — GitHub trending presence, npm/pypi
//   downloads, HF/MCP/skill registry hits, funding mentions, etc. — is
//   already in Redis but never fanned out per-drop.
//
// SOLUTION
//   For each new drop, after `pipeline.ingestRepo()` completes, fan out
//   across N data-store keys (existing worker-populated payloads). For each
//   channel, the finder fn extracts a tiny verdict: "found N stars" /
//   "ranked #4" / "no match". Verdicts are written to the submission record
//   as `scanChannels[]` so the live-queue chip can render "scanning 14/22"
//   → "22/22 ✓".
//
// DESIGN
//   - Channels are declared as a flat array — adding one is a single object
//     entry; no central registry to touch.
//   - Finder fns are total: they receive the raw payload + the normalized
//     fullName, and return either a `signal | null`. They MUST NOT throw —
//     if a payload shape drifts, the channel reports `status: "error"`.
//   - Concurrency is bounded by N parallel reads (data-store `readMany`
//     collapses N round-trips → 1 MGET on Redis).
//   - The scan is idempotent — running it twice on the same submission
//     overwrites the previous verdicts with fresh ones.

import { getDataStore } from "@/lib/data-store";
import type { ScanChannelVerdict } from "@/lib/repo-submissions-types";

interface ChannelDef {
  /** Display name shown on the live-queue chip. */
  channel: string;
  /** Data-store key (matches `ss:data:v1:<slug>`). */
  slug: string;
  /** Returns a non-null signal when the repo is found; null when absent. */
  finder: (payload: unknown, normalizedFullName: string) => string | number | null;
}

// ---------------------------------------------------------------------------
// Finders — keep small. Each accepts raw payload (may be array, object, or
// null) and returns a signal | null. They MUST be defensive — the same
// finder runs against payloads written by 30+ worker fetchers with their
// own schemas.
// ---------------------------------------------------------------------------

function normalizeFullName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.includes("/")) return null;
  return trimmed.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

const ARRAY_KEYS = new Set([
  "items",
  "repos",
  "entries",
  "data",
  "rows",
  "models",
  "spaces",
  "datasets",
  "papers",
  "signals",
  "startups",
  "packages",
  "results",
  "servers",
  "skills",
]);

function normalizeRepoCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const githubMatch = trimmed.match(
    /github\.com[:/]([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#]|$)/i,
  );
  if (githubMatch) {
    return `${githubMatch[1]}/${githubMatch[2]}`.toLowerCase();
  }

  return normalizeFullName(trimmed);
}

function candidateValues(rec: Record<string, unknown>): unknown[] {
  const direct = [
    rec.fullName,
    rec.full_name,
    rec.repo,
    rec.slug,
    rec.name,
    rec.repository,
    rec.repo_name,
    rec.repoName,
    rec.id,
    rec.linkedRepo,
    rec.repositoryUrl,
    rec.homepage,
    rec.url,
  ];

  const out: unknown[] = [...direct];
  for (const key of ["repository", "repo", "linkedRepo"]) {
    const nested = asRecord(rec[key]);
    if (!nested) continue;
    out.push(nested.fullName, nested.full_name, nested.url, nested.html_url);
  }

  const linkedRepos = asArray(rec.linkedRepos);
  if (linkedRepos) {
    for (const linked of linkedRepos) {
      out.push(linked);
      const nested = asRecord(linked);
      if (nested) {
        out.push(nested.fullName, nested.full_name, nested.repo, nested.url);
      }
    }
  }

  return out;
}

function readPath(rec: Record<string, unknown>, path: string): unknown {
  let current: unknown = rec;
  for (const part of path.split(".")) {
    const obj = asRecord(current);
    if (!obj) return undefined;
    current = obj[part];
  }
  return current;
}

function signalFromRecord(
  rec: Record<string, unknown>,
  signalKey?: string,
): string | number {
  const candidates = signalKey
    ? [readPath(rec, signalKey)]
    : [
        rec.starsTotal,
        rec.stars,
        rec.total_score,
        rec.score,
        rec.rank,
        rec.downloads,
        rec.downloads7d,
        rec.likes,
        rec.trendingScore,
        rec.repoCurrentPeriodRank,
        readPath(rec, "revenue.last30Days"),
        readPath(rec, "revenue.mrr"),
      ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "found";
}

function collectCandidateArrays(payload: unknown, depth = 0): unknown[][] {
  const directArray = asArray(payload);
  if (directArray) return [directArray];
  if (depth > 4) return [];

  const rec = asRecord(payload);
  if (!rec) return [];

  const arrays: unknown[][] = [];
  for (const [key, value] of Object.entries(rec)) {
    const arr = asArray(value);
    if (arr && (ARRAY_KEYS.has(key) || depth <= 3)) {
      arrays.push(arr);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      arrays.push(...collectCandidateArrays(value, depth + 1));
    }
  }
  return arrays;
}

/** Scan known payload arrays for any object whose repo identity matches. */
function findInList(
  payload: unknown,
  normalized: string,
  signalKey?: string,
): string | number | null {
  const arrays = collectCandidateArrays(payload);
  for (const items of arrays) {
    for (const item of items) {
      if (normalizeRepoCandidate(item) === normalized) return "found";

      const rec = asRecord(item);
      if (!rec) continue;
      if (candidateValues(rec).some((c) => normalizeRepoCandidate(c) === normalized)) {
        return signalFromRecord(rec, signalKey);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Channel registry — 23 store-backed channels. Combined with the 8 social
// channels handled by pipeline.ingestRepo, this gives each drop 31 signal
// touchpoints. Order matters for UI presentation only.
// ---------------------------------------------------------------------------

const CHANNELS: ChannelDef[] = [
  { channel: "github-trending", slug: "trending", finder: (p, n) => findInList(p, n, "stars") },
  { channel: "oss-hot-collections", slug: "hot-collections", finder: (p, n) => findInList(p, n, "repoCurrentPeriodRank") },
  { channel: "trendshift-daily", slug: "trendshift-daily", finder: (p, n) => findInList(p, n, "rank") },
  { channel: "hn-pulse", slug: "hn-pulse", finder: (p, n) => findInList(p, n, "score") },
  { channel: "npm-downloads", slug: "mcp-downloads", finder: (p, n) => findInList(p, n, "downloads") },
  { channel: "npm-packages", slug: "npm-packages", finder: (p, n) => findInList(p, n, "downloads7d") },
  { channel: "pypi-downloads", slug: "mcp-downloads-pypi", finder: (p, n) => findInList(p, n, "downloads") },
  { channel: "huggingface", slug: "huggingface-trending", finder: (p, n) => findInList(p, n, "downloads") },
  { channel: "huggingface-spaces", slug: "huggingface-spaces", finder: (p, n) => findInList(p, n, "likes") },
  { channel: "huggingface-datasets", slug: "huggingface-datasets", finder: (p, n) => findInList(p, n, "downloads") },
  { channel: "mcp-registry-official", slug: "mcp-registry-official", finder: (p, n) => findInList(p, n) },
  { channel: "pulsemcp", slug: "pulsemcp", finder: (p, n) => findInList(p, n, "rank") },
  { channel: "mcp-smithery-rank", slug: "mcp-smithery-rank", finder: (p, n) => findInList(p, n, "rank") },
  { channel: "glama", slug: "glama", finder: (p, n) => findInList(p, n, "score") },
  { channel: "claude-skills", slug: "claude-skills", finder: (p, n) => findInList(p, n) },
  { channel: "skillsmp", slug: "skillsmp", finder: (p, n) => findInList(p, n, "installs") },
  { channel: "smithery-skills", slug: "smithery-skills", finder: (p, n) => findInList(p, n, "downloads") },
  { channel: "lobehub-skills", slug: "lobehub-skills", finder: (p, n) => findInList(p, n) },
  { channel: "arxiv", slug: "arxiv-recent", finder: (p, n) => findInList(p, n) },
  { channel: "funding-news", slug: "funding-news", finder: (p, n) => findInList(p, n) },
  { channel: "crunchbase", slug: "funding-news-crunchbase", finder: (p, n) => findInList(p, n) },
  { channel: "x-funding", slug: "funding-news-x", finder: (p, n) => findInList(p, n) },
  { channel: "trustmrr", slug: "trustmrr-startups", finder: (p, n) => findInList(p, n, "revenue.last30Days") },
];

export function listScanChannels(): readonly string[] {
  return CHANNELS.map((c) => c.channel);
}

export async function runScanChannels(
  normalizedFullName: string,
): Promise<ScanChannelVerdict[]> {
  const store = getDataStore();
  const slugs = CHANNELS.map((c) => c.slug);
  const reads = await store.readMany<unknown>(slugs);
  const verdicts: ScanChannelVerdict[] = [];

  for (let i = 0; i < CHANNELS.length; i++) {
    const channel = CHANNELS[i];
    const read = reads[i];
    if (!read || read.source === "missing" || read.data === null) {
      verdicts.push({
        channel: channel.channel,
        status: "none",
        detail: "no data in store",
      });
      continue;
    }
    try {
      const signal = channel.finder(read.data, normalizedFullName);
      if (signal === null) {
        verdicts.push({ channel: channel.channel, status: "none" });
      } else {
        verdicts.push({
          channel: channel.channel,
          status: "found",
          signal,
        });
      }
    } catch (err) {
      verdicts.push({
        channel: channel.channel,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return verdicts;
}

export const SCAN_CHANNEL_COUNT = CHANNELS.length;

/**
 * Per-drop social channels already covered by `pipeline.ingestRepo()` via the
 * Twitter / Reddit / HackerNews / Bluesky / dev.to / Lobsters / ProductHunt
 * / Tavily-web-search sweep. These don't live in `CHANNELS` (their finders
 * are inside the social-adapter layer, not data-store reads), but they ARE
 * scanned per drop — count them so the UI can quote an honest total.
 *
 * Update in lockstep with `getDefaultSocialAdapters()` in
 * `src/lib/pipeline/adapters/social-adapters.ts`.
 */
export const SOCIAL_SCAN_CHANNEL_COUNT = 8;

/** Total per-drop signal touchpoints (data-store + social adapters). */
export const TOTAL_SCAN_CHANNEL_COUNT =
  SCAN_CHANNEL_COUNT + SOCIAL_SCAN_CHANNEL_COUNT;
