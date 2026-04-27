// Pipeline repos.jsonl fallback loader (mtime-cached).
//
// `.data/repos.jsonl` is the pipeline's persisted repo store — it carries
// every repo the in-memory `repoStore` has ever tracked, including mature
// projects (ollama, vercel/next.js, huggingface/transformers, etc.) that
// have aged out of OSSInsights's trending lists and aren't in the
// supplemental recent-repos / manual-repos feeds.
//
// On cold Vercel Lambdas the in-memory store is empty, so without this
// fallback those repos would 404 on `/repo/[owner]/[name]`. Reading the
// JSONL at request time and supplementing `getDerivedRepos()` restores
// coverage parity with the persisted pipeline state.
//
// Cached by mtime + size (same pattern as repo-reasons.ts). The JSONL is
// rewritten in bulk by the pipeline store, so a single mtime stamp
// invalidates safely.
//
// Extracted from derived-repos.ts as Sprint 4 step 2 of LIB-01.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { currentDataDir, FILES } from "../../pipeline/storage/file-persistence";
import type { Repo } from "../../types";

let _pipelineReposCache:
  | {
      mtimeMs: number;
      size: number;
      rows: Repo[];
    }
  | null = null;

function pipelineReposFilePath(): string {
  return join(currentDataDir(), FILES.repos);
}

function loadPipelineReposFromDisk(): Repo[] {
  const path = pipelineReposFilePath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }

  const out: Repo[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as Repo;
      if (record && typeof record.fullName === "string" && record.fullName.includes("/")) {
        out.push(record);
      }
    } catch {
      // Skip malformed lines — the rest of the file is still usable.
    }
  }
  return out;
}

/**
 * Returns the persisted pipeline repos, mtime-cached. Empty array when the
 * file is missing or unreadable — callers degrade to other loaders.
 */
export function getPipelineRepos(): Repo[] {
  const path = pipelineReposFilePath();
  let mtimeMs = -1;
  let size = -1;
  try {
    const stat = statSync(path);
    mtimeMs = stat.mtimeMs;
    size = stat.size;
  } catch {
    mtimeMs = -1;
    size = -1;
  }
  if (
    _pipelineReposCache &&
    _pipelineReposCache.mtimeMs === mtimeMs &&
    _pipelineReposCache.size === size
  ) {
    return _pipelineReposCache.rows;
  }
  const rows = loadPipelineReposFromDisk();
  _pipelineReposCache = { mtimeMs, size, rows };
  return rows;
}

/**
 * Stamp used as part of the `derived-repos` cache key. When the JSONL is
 * rewritten by the pipeline store, this changes and the orchestrator
 * recomputes the assembled `Repo[]`.
 */
export function getPipelineReposDataVersion(): string {
  const path = pipelineReposFilePath();
  try {
    const stat = statSync(path);
    return `jsonl:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "jsonl:none";
  }
}

/** Test-only — drop the in-process cache. */
export function __resetPipelineReposCacheForTests(): void {
  _pipelineReposCache = null;
}
