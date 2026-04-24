// Per-repo funding event loader.
//
// Links funding signals (from data/funding-news.json) to repos via the
// matcher in src/lib/funding/match.ts, filtered at confidence >= 0.6 and
// sorted announced_at desc.
//
// Module-level memo: re-computes only when either the funding JSON or the
// repo-metadata source changes. A miss on either does no work and returns []
// — this is a read-only overlay, not something the render path can rely on.

import { statSync } from "node:fs";
import { resolve } from "node:path";

import { getFundingFile } from "../funding-news";
import { listRepoMetadata } from "../repo-metadata";
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

function buildCandidates(): RepoCandidate[] {
  const all = listRepoMetadata();
  const registry = getFundingAliasRegistry();
  const candidates: RepoCandidate[] = [];
  for (const meta of all) {
    // Enrich with curated brand aliases + owner-level domains so the
    // matcher's alias + domain bands can fire for names like "Hugging Face"
    // → `huggingface/transformers` or domains like `anthropic.com` →
    // `anthropics/claude-code`. Repos without a registry entry keep
    // empty aliases (existing matcher behavior preserved).
    const entry = registry.get(meta.fullName.toLowerCase());
    candidates.push({
      fullName: meta.fullName,
      homepage: meta.homepageUrl ?? null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    });
  }
  return candidates;
}

function buildIndex(): MatchIndex {
  const signature = `${fundingFileSignature()}:${aliasFileSignature()}:${listRepoMetadata().length}`;
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
