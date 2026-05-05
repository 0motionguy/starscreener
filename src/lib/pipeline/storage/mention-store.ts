// StarScreener Pipeline — append-only mention persistence helpers
//
// Phase 2 (F-DATA-social-persist) thin wrapper around `appendJsonlFile` that
// dedupes by `(source, url, repoId)` against existing rows so social adapters
// firing during ingest can persist mentions without producing duplicates when
// the same post bubbles up across multiple polls — while still letting a
// single source URL that mentions N tracked repos fan out to N rows.
//
// The in-memory `InMemoryMentionStore` already exists in `memory-stores.ts`
// and persists the canonical `mentions.jsonl` via `writeJsonlFile` on flush.
// This module is the *append-only* counterpart used by ingest-time fan-out:
//   - reads the current file (cheap; bounded by the file size)
//   - filters incoming mentions to those whose `(source, url, repoId)` tuple
//     isn't already on disk
//   - appends the survivors as individual JSONL lines under a per-file lock
//
// Why two paths?
//   - `InMemoryMentionStore.append` is the source of truth for the in-process
//     working set: it dedupes by id + normalizedUrl in memory, drives the
//     debounced full-file rewrite, and powers `aggregateForRepo`.
//   - `appendMentionsToFile` is for callers who want the raw JSONL line to
//     land on disk *now* without waiting on the debounce — used by the
//     verify harness, batch ingest jobs, and any future write-only pipeline
//     that doesn't need to read.
//
// Both paths produce the same `.data/mentions.jsonl` shape; cross-source
// dedup invariants hold because `InMemoryMentionStore.hydrate` re-reads the
// file and rebuilds the in-memory dedup index on the next process start.

import type { SocialPlatform } from "@/lib/types";

import type { RepoMention } from "../types";
import { canonicalizeUrl } from "@/lib/mention-dedupe";
import {
  FILES,
  appendJsonlFile,
  isPersistenceEnabled,
  readJsonlFile,
  withFileLock,
} from "./file-persistence";

// ---------------------------------------------------------------------------
// Dedup key
// ---------------------------------------------------------------------------

/**
 * Compute the `(source, url, repoId)` dedup key. Uses normalizedUrl when set
 * so tracking-param + trailing-slash + www variants collapse across sources;
 * falls back to the raw url. Empty/unparseable urls are namespaced under a
 * sentinel so one malformed row doesn't swallow every malformed sibling.
 *
 * RepoId is part of the key because a single source URL can legitimately
 * mention multiple tracked repos (an HN comment that links to two GitHub
 * repos, an awesome-list post). Without repoId the second repo's row would
 * get dropped as a duplicate, silently losing the cross-repo association.
 * The in-memory store already keys by repoId so this only matters for the
 * file-persist path, but keeping both paths' invariants identical means
 * `InMemoryMentionStore.hydrate` rebuilds the same shape from disk.
 */
export function mentionDedupKey(mention: RepoMention): string {
  const canonical =
    mention.normalizedUrl ??
    (mention.url ? canonicalizeUrl(mention.url) : null) ??
    `__nourl__:${mention.id}`;
  return `${canonical} ${mention.repoId}`;
}

// ---------------------------------------------------------------------------
// Append helpers
// ---------------------------------------------------------------------------

export interface AppendMentionsResult {
  /** Mentions handed in by the caller, before dedup. */
  attempted: number;
  /** Mentions actually persisted to disk on this call. */
  appended: number;
  /** Mentions skipped because their `(source, url, repoId)` already lives on disk. */
  duplicates: number;
}

/**
 * Append `mentions` to `.data/mentions.jsonl`, dropping any row whose
 * `(source, url, repoId)` tuple already lives on disk OR appears earlier in the same
 * batch. Each survivor lands as one JSONL line via `appendJsonlFile`.
 *
 * No-op (returns zeros) when persistence is disabled — matches the rest of
 * the storage layer's behaviour.
 *
 * Implementation note: we read the entire mentions file under the lock to
 * build the dedup set. This is O(N) per call, acceptable while the file
 * stays well under ~1M rows. If we ever cross that threshold, swap in a
 * persistent index (sqlite or a sidecar `.data/mentions-index.jsonl`); the
 * caller signature stays the same.
 */
export async function appendMentionsToFile(
  mentions: RepoMention[],
): Promise<AppendMentionsResult> {
  const result: AppendMentionsResult = {
    attempted: mentions.length,
    appended: 0,
    duplicates: 0,
  };
  if (!isPersistenceEnabled()) return result;
  if (mentions.length === 0) return result;

  return withFileLock(FILES.mentions, async () => {
    const existing = await readJsonlFile<RepoMention>(FILES.mentions);
    const seen = new Set<string>();
    for (const m of existing) {
      seen.add(mentionDedupKey(m));
    }

    for (const raw of mentions) {
      // Materialize normalizedUrl up-front so the on-disk record matches
      // what the in-memory store would have written, and so dedup rounds
      // across calls collapse the same way.
      const mention: RepoMention =
        "normalizedUrl" in raw
          ? raw
          : {
              ...raw,
              normalizedUrl: raw.url ? canonicalizeUrl(raw.url) : null,
            };
      if (!mention.sourcePlatforms || mention.sourcePlatforms.length === 0) {
        mention.sourcePlatforms = [mention.platform];
      }
      const key = mentionDedupKey(mention);
      if (seen.has(key)) {
        result.duplicates += 1;
        continue;
      }
      seen.add(key);
      await appendJsonlFile<RepoMention>(FILES.mentions, mention);
      result.appended += 1;
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Read every mention persisted in `.data/mentions.jsonl`. Returns `[]` when
 * the file is missing or persistence is disabled. Malformed JSONL lines are
 * skipped (with a warning) by the underlying `readJsonlFile` helper, so a
 * single corrupt row never poisons the rest of the batch.
 */
export async function readPersistedMentions(): Promise<RepoMention[]> {
  if (!isPersistenceEnabled()) return [];
  return readJsonlFile<RepoMention>(FILES.mentions);
}

/**
 * Group mentions by repoId. Useful for the aggregator and for any read path
 * that needs per-repo slices without building the index itself.
 */
export function groupMentionsByRepo(
  mentions: RepoMention[],
): Map<string, RepoMention[]> {
  const out = new Map<string, RepoMention[]>();
  for (const m of mentions) {
    const arr = out.get(m.repoId);
    if (arr) arr.push(m);
    else out.set(m.repoId, [m]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source-active helper — exported for the aggregator + tests.
// ---------------------------------------------------------------------------

/** Distinct social platforms represented in a mention list. */
export function activeSources(mentions: RepoMention[]): SocialPlatform[] {
  const out = new Set<SocialPlatform>();
  for (const m of mentions) out.add(m.platform);
  return Array.from(out);
}
