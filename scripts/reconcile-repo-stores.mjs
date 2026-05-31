#!/usr/bin/env node
// Reconcile `.data/repos.jsonl` with `data/repo-metadata.json`.
//
// Diagnosis
// ---------
// StarScreener tracks repos in two independent stores that have diverged:
//   - `.data/repos.jsonl` (334 rows) is the pipeline's persisted `repoStore`.
//     Written at request time by the ingest pipeline (OSSInsights trending
//     + manual submissions funneled through `src/lib/pipeline/storage/...`).
//     Shape: flat `Repo` records; no `homepageUrl` field.
//   - `data/repo-metadata.json` (869 rows) is a build-time scraper snapshot.
//     Written by `scripts/fetch-repo-metadata.mjs`, which hydrates metadata
//     for every repo currently surfaced by `data/trending.json`,
//     `data/recent-repos.json`, and `data/manual-repos.json`. Carries rich
//     GitHub fields — homepageUrl, topics, defaultBranch, pushedAt, ...
//
// The two stores share only ~32 fullNames because their input sets diverge:
//   1. The pipeline JSONL accumulates every repo ingest has ever persisted
//      (including repos that have since aged out of trending).
//   2. The scraper's source list is the CURRENT trending + recent + manual
//      snapshots only — it does not read `.data/repos.jsonl`.
// Therefore: mature repos in the pipeline (ollama/ollama, huggingface/
// transformers, vercel/next.js, ...) are invisible to `listRepoMetadata()`.
//
// This blocks funding matching, ProductHunt launch linking, AISO joins,
// and any other surface keyed on the metadata candidate set.
//
// Fix: fold every `.data/repos.jsonl` fullName that isn't already in
// `data/repo-metadata.json` in as a minimal metadata stub, preserving the
// on-disk shape so `listRepoMetadata()` consumers keep working unchanged.
// Stubs carry `homepageUrl: null` (the pipeline row has no homepage), so
// they won't contribute to the matcher's domain band — but the funding
// alias registry + owner/name bands fire, which is the critical gap.
//
// This is an operator-run reconciliation (not live-patched at request time).
// Run it whenever the pipeline JSONL has drifted:
//   node scripts/reconcile-repo-stores.mjs
//
// Idempotent: running twice produces identical output because existing items
// are preserved byte-for-byte and stubs are deterministic.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSONL_FILE = resolve(ROOT, ".data", "repos.jsonl");
const METADATA_FILE = resolve(ROOT, "data", "repo-metadata.json");

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function loadPipelineRepos(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (record && typeof record.fullName === "string" && record.fullName.includes("/")) {
        out.push(record);
      }
    } catch {
      // Skip malformed lines — the rest of the file is still usable.
    }
  }
  return out;
}

function loadMetadataFile(path) {
  if (!existsSync(path)) {
    return { fetchedAt: null, sourceCount: 0, items: [], failures: [] };
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`repo-metadata.json is not a JSON object: ${path}`);
  }
  if (!Array.isArray(parsed.items)) parsed.items = [];
  if (!Array.isArray(parsed.failures)) parsed.failures = [];
  return parsed;
}

// ---------------------------------------------------------------------------
// Stub builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal RepoMetadata-shaped entry from a pipeline JSONL row.
 * The pipeline row has no homepageUrl / defaultBranch / pushedAt / updatedAt
 * / archived / disabled / fork flags, so those default to null / false.
 * createdAt + lastCommitAt come straight from the JSONL when present.
 */
function stubFromPipelineRow(row) {
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : "";
  const lastCommit = typeof row.lastCommitAt === "string" ? row.lastCommitAt : createdAt;
  return {
    githubId: null,
    fullName: row.fullName,
    name: typeof row.name === "string" ? row.name : row.fullName.split("/")[1] ?? row.fullName,
    owner: typeof row.owner === "string" ? row.owner : row.fullName.split("/")[0] ?? "",
    ownerAvatarUrl: typeof row.ownerAvatarUrl === "string" ? row.ownerAvatarUrl : "",
    description: typeof row.description === "string" ? row.description : "",
    url: typeof row.url === "string" ? row.url : `https://github.com/${row.fullName}`,
    homepageUrl: null,
    language: typeof row.language === "string" ? row.language : null,
    topics: Array.isArray(row.topics) ? row.topics.filter((t) => typeof t === "string") : [],
    stars: Number.isFinite(row.stars) ? row.stars : 0,
    forks: Number.isFinite(row.forks) ? row.forks : 0,
    openIssues: Number.isFinite(row.openIssues) ? row.openIssues : 0,
    createdAt,
    updatedAt: lastCommit,
    pushedAt: lastCommit,
    defaultBranch: null,
    archived: false,
    disabled: false,
    fork: false,
    // Stubs are tagged so operators can diff "real" items vs reconciler-filled
    // stubs if they need to re-hydrate via the scraper later. The consumer
    // (src/lib/repo-metadata.ts) doesn't read this field — it's advisory.
    source: "pipeline-jsonl-stub",
    fetchedAt: createdAt || new Date(0).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function reconcile(metadata, pipelineRows) {
  const existingByFullName = new Map();
  for (const item of metadata.items) {
    if (item && typeof item.fullName === "string") {
      existingByFullName.set(item.fullName.toLowerCase(), item);
    }
  }

  const preserved = metadata.items.slice();
  const preservedCount = preserved.length;
  let added = 0;

  // Sort pipeline rows by fullName for deterministic output.
  const sortedRows = [...pipelineRows].sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()),
  );

  for (const row of sortedRows) {
    const key = row.fullName.toLowerCase();
    if (existingByFullName.has(key)) continue;
    const stub = stubFromPipelineRow(row);
    preserved.push(stub);
    existingByFullName.set(key, stub);
    added++;
  }

  // Keep existing top-level metadata (fetchedAt, sourceCount) intact.
  // sourceCount tracked the scraper's input list; we surface the union
  // size as a SEPARATE field so the original value stays verifiable.
  const merged = {
    ...metadata,
    items: preserved,
    // Do not mutate sourceCount — that belongs to the scraper. Instead
    // expose a reconciled total for observability.
    reconciledCount: preserved.length,
    reconciledAt: new Date().toISOString(),
  };

  return { merged, preservedCount, added };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main() {
  const pipelineRows = loadPipelineRepos(JSONL_FILE);
  const metadata = loadMetadataFile(METADATA_FILE);

  console.log(`[reconcile] pipeline JSONL rows: ${pipelineRows.length}`);
  console.log(`[reconcile] repo-metadata items: ${metadata.items.length}`);

  const { merged, preservedCount, added } = reconcile(metadata, pipelineRows);
  const total = merged.items.length;

  // Pretty-print with 2-space indent to match the existing file style.
  const nextRaw = `${JSON.stringify(merged, null, 2)}\n`;

  // Idempotency check: if the merged payload matches the on-disk file
  // byte-for-byte (modulo the `reconciledAt` timestamp we just stamped),
  // don't rewrite. We compare on the sorted-items payload instead.
  const prevRaw = existsSync(METADATA_FILE) ? readFileSync(METADATA_FILE, "utf8") : "";
  let prevParsed = null;
  try {
    prevParsed = prevRaw ? JSON.parse(prevRaw) : null;
  } catch {
    prevParsed = null;
  }

  const prevItemCount = Array.isArray(prevParsed?.items) ? prevParsed.items.length : 0;
  const willChangeItems = prevItemCount !== total;

  if (!willChangeItems && added === 0) {
    console.log(
      `[reconcile] no changes — ${preservedCount} existing entries, 0 stubs to add (already reconciled)`,
    );
    return;
  }

  writeFileSync(METADATA_FILE, nextRaw);
  console.log(
    `[reconcile] added ${added} stub entries, preserved ${preservedCount} existing, total ${total}`,
  );
}

main();
