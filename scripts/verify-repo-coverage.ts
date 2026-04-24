#!/usr/bin/env node
// Verify repo-store coverage + funding-match count.
//
// Prints:
//   jsonl=N metadata=M intersection=K jsonl-only=J metadata-only=L
//   funding-signals=S funding-matches=F  (match-count at >= 0.6 confidence)
//
// Usage:
//   tsx scripts/verify-repo-coverage.ts
//
// Run BEFORE and AFTER `scripts/reconcile-repo-stores.mjs` to quantify the
// coverage uplift. The matcher logic mirrors src/lib/funding/repo-events.ts
// so the number here matches what the /repo/[owner]/[name] funding-events
// surface would attach at render time.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getFundingAliasRegistry } from "../src/lib/funding/aliases";
import {
  matchFundingEventToRepo,
  type RepoCandidate,
} from "../src/lib/funding/match";
import type { FundingSignal } from "../src/lib/funding/types";
import type { RepoMetadata } from "../src/lib/repo-metadata";
import type { Repo } from "../src/lib/types";

const ROOT = resolve(__dirname, "..");
const JSONL_FILE = resolve(ROOT, ".data", "repos.jsonl");
const METADATA_FILE = resolve(ROOT, "data", "repo-metadata.json");
const FUNDING_FILE = resolve(ROOT, "data", "funding-news.json");

const CONFIDENCE_FLOOR = 0.6;

interface RepoMetadataFile {
  items?: RepoMetadata[];
}

interface FundingFile {
  signals?: FundingSignal[];
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadJsonlRepos(path: string): Repo[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
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
      // Skip malformed lines.
    }
  }
  return out;
}

function loadMetadata(path: string): RepoMetadata[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as RepoMetadataFile;
  return Array.isArray(parsed.items) ? parsed.items : [];
}

function loadFunding(path: string): FundingSignal[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as FundingFile;
  return Array.isArray(parsed.signals) ? parsed.signals : [];
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function coverage(jsonl: Repo[], metadata: RepoMetadata[]): {
  jsonl: number;
  metadata: number;
  intersection: number;
  jsonlOnly: number;
  metadataOnly: number;
} {
  const jsonlSet = new Set(
    jsonl.map((r) => r.fullName.toLowerCase()),
  );
  const metaSet = new Set(
    metadata.map((m) => m.fullName.toLowerCase()),
  );
  let intersection = 0;
  let jsonlOnly = 0;
  let metadataOnly = 0;
  for (const n of jsonlSet) {
    if (metaSet.has(n)) intersection++;
    else jsonlOnly++;
  }
  for (const n of metaSet) {
    if (!jsonlSet.has(n)) metadataOnly++;
  }
  return {
    jsonl: jsonlSet.size,
    metadata: metaSet.size,
    intersection,
    jsonlOnly,
    metadataOnly,
  };
}

// ---------------------------------------------------------------------------
// Candidate assembly — mirrors src/lib/funding/repo-events.ts buildCandidates
// but takes the UNION of metadata items and pipeline-jsonl rows so this
// verifier is insensitive to whether the reconciler has been run yet.
// ---------------------------------------------------------------------------

function buildCandidatesUnion(
  metadata: RepoMetadata[],
  jsonl: Repo[],
): RepoCandidate[] {
  const registry = getFundingAliasRegistry();
  const byFullName = new Map<string, RepoCandidate>();

  for (const meta of metadata) {
    if (!meta.fullName) continue;
    const key = meta.fullName.toLowerCase();
    const entry = registry.get(key);
    byFullName.set(key, {
      fullName: meta.fullName,
      homepage: meta.homepageUrl ?? null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    });
  }

  for (const row of jsonl) {
    if (!row.fullName) continue;
    const key = row.fullName.toLowerCase();
    if (byFullName.has(key)) continue;
    const entry = registry.get(key);
    byFullName.set(key, {
      fullName: row.fullName,
      homepage: null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    });
  }

  return Array.from(byFullName.values());
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main(): void {
  const jsonl = loadJsonlRepos(JSONL_FILE);
  const metadata = loadMetadata(METADATA_FILE);
  const signals = loadFunding(FUNDING_FILE);

  const cov = coverage(jsonl, metadata);
  console.log(
    `jsonl=${cov.jsonl} metadata=${cov.metadata} intersection=${cov.intersection} jsonl-only=${cov.jsonlOnly} metadata-only=${cov.metadataOnly}`,
  );

  // Metadata-only candidate build (mirrors CURRENT repo-events.ts).
  const metadataOnlyCandidates: RepoCandidate[] = metadata.map((m) => {
    const entry = getFundingAliasRegistry().get(m.fullName.toLowerCase());
    return {
      fullName: m.fullName,
      homepage: m.homepageUrl ?? null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    };
  });

  // Union candidate build (what repo-events.ts should do going forward).
  const unionCandidates = buildCandidatesUnion(metadata, jsonl);

  const matchCount = (candidates: RepoCandidate[]): number => {
    let hits = 0;
    for (const signal of signals) {
      const m = matchFundingEventToRepo(signal, candidates);
      if (m && m.confidence >= CONFIDENCE_FLOOR) hits++;
    }
    return hits;
  };

  const metadataOnlyHits = matchCount(metadataOnlyCandidates);
  const unionHits = matchCount(unionCandidates);

  console.log(
    `funding-signals=${signals.length} metadata-only-matches=${metadataOnlyHits} union-matches=${unionHits}`,
  );
}

main();
