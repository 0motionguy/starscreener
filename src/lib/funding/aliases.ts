// Funding-alias registry loader.
//
// Curated map of `repoFullName -> { aliases, domains }` used to enrich
// `RepoCandidate` entries before the matcher runs in match.ts. Without
// this, names like "Hugging Face" never link to `huggingface/transformers`
// because the derived metadata only carries `owner/name` + homepage URL.
//
// Mtime-cached like src/lib/repo-reasons.ts — the seed file is tiny
// (dozens of entries), so a single mtime check is enough to invalidate
// between process lifetimes. Malformed entries are dropped with a console
// warn; the rest of the registry remains usable.
//
// Source of truth: data/funding-aliases.json. Write via
// scripts/add-funding-alias.mjs so ordering + shape stay stable.
//
// Contract:
//   getFundingAliasRegistry() -> Map<lowercaseRepoFullName, FundingAliasEntry>

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface FundingAliasEntry {
  /** Canonical `owner/name` identifier. Keyed lower-case in the map. */
  repoFullName: string;
  /** Alternative names the project ships under (brand / legal / shorthand). */
  aliases: string[];
  /** Registrable domains the brand owns — fed into the matcher's domain band. */
  domains: string[];
}

interface AliasFile {
  generatedAt?: string;
  entries: unknown;
}

const DEFAULT_ALIAS_PATH = resolve(
  process.cwd(),
  "data",
  "funding-aliases.json",
);

let overridePath: string | null = null;

function aliasPath(): string {
  return overridePath ?? DEFAULT_ALIAS_PATH;
}

// ---------------------------------------------------------------------------
// Mtime cache
// ---------------------------------------------------------------------------

let cache:
  | {
      mtimeMs: number;
      path: string;
      byRepoFullName: Map<string, FundingAliasEntry>;
    }
  | null = null;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) return false;
  }
  return true;
}

function coerceEntry(raw: unknown): FundingAliasEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<FundingAliasEntry>;

  if (typeof entry.repoFullName !== "string") return null;
  const fullName = entry.repoFullName.trim();
  if (!fullName.includes("/")) return null;

  const aliases = isNonEmptyStringArray(entry.aliases) ? entry.aliases : null;
  const domains = isNonEmptyStringArray(entry.domains) ? entry.domains : null;
  if (!aliases && !domains) return null;

  return {
    repoFullName: fullName,
    aliases: aliases ?? [],
    domains: domains ?? [],
  };
}

function loadFileSync(): Map<string, FundingAliasEntry> {
  const out = new Map<string, FundingAliasEntry>();
  const path = aliasPath();
  if (!existsSync(path)) return out;

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }

  let parsed: AliasFile;
  try {
    parsed = JSON.parse(raw) as AliasFile;
  } catch (err) {
    console.warn(
      `[funding-aliases] failed to parse ${path}: ${(err as Error).message}`,
    );
    return out;
  }

  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  for (const rawEntry of rawEntries) {
    const coerced = coerceEntry(rawEntry);
    if (!coerced) {
      console.warn(
        `[funding-aliases] dropping malformed entry: ${JSON.stringify(rawEntry)}`,
      );
      continue;
    }
    out.set(coerced.repoFullName.toLowerCase(), coerced);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the curated alias registry keyed by `repoFullName.toLowerCase()`.
 * Safe to call repeatedly — re-reads only when the file's mtime changes.
 * Missing file → empty map (matcher falls back to default behavior).
 */
export function getFundingAliasRegistry(): Map<string, FundingAliasEntry> {
  const path = aliasPath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  if (cache && cache.mtimeMs === mtimeMs && cache.path === path) {
    return cache.byRepoFullName;
  }
  const byRepoFullName = loadFileSync();
  cache = { mtimeMs, path, byRepoFullName };
  return byRepoFullName;
}

/** Test-only: point the loader at a different JSON file (absolute path). */
export function __setFundingAliasPathForTests(path: string | null): void {
  overridePath = path;
  cache = null;
}

/** Test-only cache reset. */
export function __resetFundingAliasCacheForTests(): void {
  cache = null;
}
