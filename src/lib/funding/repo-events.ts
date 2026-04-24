// Per-repo funding event loader.
//
// Links funding signals (from data/funding-news.json) to repos via the
// matcher in src/lib/funding/match.ts, filtered at confidence >= 0.6 and
// sorted announced_at desc.
//
// Module-level memo: re-computes only when either the funding JSON or the
// repo-metadata source changes. A miss on either does no work and returns []
// — this is a read-only overlay, not something the render path can rely on.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { getFundingFile } from "../funding-news";
import { currentDataDir, FILES } from "../pipeline/storage/file-persistence";
import { listRepoMetadata } from "../repo-metadata";
import type { Repo } from "../types";
import { getFundingAliasRegistry } from "./aliases";
import {
  matchFundingEventToRepo,
  type FundingMatchResult,
  type RepoCandidate,
} from "./match";
import type { FundingSignal } from "./types";

/** Minimum confidence an event must clear to attach to a repo. */
const CONFIDENCE_FLOOR = 0.6;
/** Cap per-repo — the UI shows a subset; this is the upstream limit. */
const MAX_EVENTS_PER_REPO = 10;

/** A funding signal annotated with its match metadata. */
export interface RepoFundingEvent {
  signal: FundingSignal;
  match: FundingMatchResult;
}

// ---------------------------------------------------------------------------
// Memo
// ---------------------------------------------------------------------------

const FUNDING_NEWS_PATH = resolve(process.cwd(), "data", "funding-news.json");
const FUNDING_ALIASES_PATH = resolve(
  process.cwd(),
  "data",
  "funding-aliases.json",
);

interface MatchIndex {
  /** Cache key = funding file signature + candidate count. */
  signature: string;
  byFullName: Map<string, RepoFundingEvent[]>;
}

let cache: MatchIndex | null = null;

function fundingFileSignature(): string {
  try {
    const stat = statSync(FUNDING_NEWS_PATH);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function aliasFileSignature(): string {
  try {
    const stat = statSync(FUNDING_ALIASES_PATH);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function pipelineReposFilePath(): string {
  return join(currentDataDir(), FILES.repos);
}

function pipelineReposFileSignature(): string {
  try {
    const stat = statSync(pipelineReposFilePath());
    return `jsonl:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "jsonl:missing";
  }
}

/**
 * Load pipeline-persisted repo rows from `.data/repos.jsonl`. These fullNames
 * feed the second pass in `buildCandidates()` so the matcher sees every repo
 * the pipeline has ever tracked — not just the subset in
 * `data/repo-metadata.json`.
 *
 * No mtime cache here; `buildCandidates()` is already memoized by
 * `buildIndex()`'s signature, which includes the JSONL stat via
 * `pipelineReposFileSignature()`. Reading synchronously on index rebuild
 * keeps the data paths simple and test-friendly.
 */
function loadPipelineRepoFullNames(): string[] {
  const path = pipelineReposFilePath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as Partial<Repo>;
      if (
        record &&
        typeof record.fullName === "string" &&
        record.fullName.includes("/")
      ) {
        out.push(record.fullName);
      }
    } catch {
      // Skip malformed lines — the rest of the file is still usable.
    }
  }
  return out;
}

/**
 * Build the full union of repo candidates for funding matching.
 *
 * Historically this only iterated `listRepoMetadata()`, so repos that lived
 * in the pipeline's `.data/repos.jsonl` (mature projects aged out of
 * OSSInsights trending) were invisible to the matcher — blocking brand-level
 * alias hits for them. We now fold in any JSONL fullName missing from the
 * metadata set so the matcher is resilient even when the operator-run
 * reconciler (`scripts/reconcile-repo-stores.mjs`) hasn't filled them in.
 *
 * Metadata entries carry homepageUrl → they contribute to the domain band.
 * JSONL-only entries have no homepage → they only feed the alias / owner /
 * name / fuzzy bands, which is enough for registry-backed brand matching.
 */
export function buildCandidates(): RepoCandidate[] {
  const all = listRepoMetadata();
  const registry = getFundingAliasRegistry();
  const byFullName = new Map<string, RepoCandidate>();

  for (const meta of all) {
    if (!meta.fullName) continue;
    // Enrich with curated brand aliases + owner-level domains so the
    // matcher's alias + domain bands can fire for names like "Hugging Face"
    // → `huggingface/transformers` or domains like `anthropic.com` →
    // `anthropics/claude-code`. Repos without a registry entry keep
    // empty aliases (existing matcher behavior preserved).
    const entry = registry.get(meta.fullName.toLowerCase());
    byFullName.set(meta.fullName.toLowerCase(), {
      fullName: meta.fullName,
      homepage: meta.homepageUrl ?? null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    });
  }

  for (const fullName of loadPipelineRepoFullNames()) {
    const key = fullName.toLowerCase();
    if (byFullName.has(key)) continue;
    const entry = registry.get(key);
    byFullName.set(key, {
      fullName,
      homepage: null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    });
  }

  return Array.from(byFullName.values());
}

function buildIndex(): MatchIndex {
  const signature = `${fundingFileSignature()}:${aliasFileSignature()}:${pipelineReposFileSignature()}:${listRepoMetadata().length}`;
  if (cache && cache.signature === signature) return cache;

  const file = getFundingFile();
  const candidates = buildCandidates();
  const byFullName = new Map<string, RepoFundingEvent[]>();

  for (const signal of file.signals ?? []) {
    const match = matchFundingEventToRepo(signal, candidates);
    if (!match) continue;
    if (match.confidence < CONFIDENCE_FLOOR) continue;
    const key = match.repoFullName.toLowerCase();
    let bucket = byFullName.get(key);
    if (!bucket) {
      bucket = [];
      byFullName.set(key, bucket);
    }
    bucket.push({ signal, match });
  }

  for (const bucket of byFullName.values()) {
    bucket.sort(
      (a, b) =>
        Date.parse(b.signal.publishedAt) - Date.parse(a.signal.publishedAt),
    );
    if (bucket.length > MAX_EVENTS_PER_REPO) {
      bucket.length = MAX_EVENTS_PER_REPO;
    }
  }

  cache = { signature, byFullName };
  return cache;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolved funding events for a repo, newest first, capped at
 * MAX_EVENTS_PER_REPO. Returns `[]` when:
 *   - the funding JSON is missing / empty
 *   - no signal matched this repo at >= 0.6 confidence
 *
 * Lazy: runs the matcher on first call, memos until the funding file or the
 * repo-metadata set changes.
 */
export function getFundingEventsForRepo(
  fullName: string,
): RepoFundingEvent[] {
  return buildIndex().byFullName.get(fullName.toLowerCase()) ?? [];
}

/**
 * Aggregate counts for all matched repos — useful for list-surface summaries
 * (e.g., a "funded repos" facet). Keyed by lowercase fullName.
 */
export function getFundingMatchCounts(): Map<string, number> {
  const idx = buildIndex();
  const out = new Map<string, number>();
  for (const [fullName, bucket] of idx.byFullName) {
    out.set(fullName, bucket.length);
  }
  return out;
}

/** Test-only cache reset. */
export function __resetFundingRepoEventsCache(): void {
  cache = null;
}
