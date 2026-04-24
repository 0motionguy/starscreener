// npm dependents-count loader.
//
// Reads .data/npm-dependents.json (written by scripts/scrape-npm-daily.mjs).
// npm has no clean public API for true dependents counts so the scraper does
// a best-effort lookup and may store `null` — callers MUST treat null as
// "unknown, don't render a number" rather than zero.
//
// Shape:
//   { "<package-name>": { "count": number | null, "fetchedAt": ISOString } }

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PATH = resolve(process.cwd(), ".data", "npm-dependents.json");

interface DependentsEntry {
  count: number | null;
  fetchedAt: string;
}

interface CacheEntry {
  signature: string;
  byPackage: Map<string, DependentsEntry>;
}

let cache: CacheEntry | null = null;
let pathOverride: string | null = null;

/** @internal — for tests. */
export function __setDependentsPathForTests(path: string | null): void {
  pathOverride = path;
  cache = null;
}

function currentPath(): string {
  return pathOverride ?? DEFAULT_PATH;
}

function fileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${path}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return `${path}:missing`;
  }
}

function loadIndex(): Map<string, DependentsEntry> {
  const path = currentPath();
  const signature = fileSignature(path);
  if (cache && cache.signature === signature) return cache.byPackage;

  const byPackage = new Map<string, DependentsEntry>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    cache = { signature, byPackage };
    return byPackage;
  }

  if (parsed && typeof parsed === "object") {
    for (const [name, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const rec = raw as Record<string, unknown>;
      const countRaw = rec.count;
      const count =
        countRaw === null
          ? null
          : typeof countRaw === "number" && Number.isFinite(countRaw)
            ? Math.max(0, Math.round(countRaw))
            : null;
      const fetchedAt = typeof rec.fetchedAt === "string" ? rec.fetchedAt : "";
      byPackage.set(name, { count, fetchedAt });
    }
  }

  cache = { signature, byPackage };
  return byPackage;
}

/**
 * Look up the dependents count for a package.
 *
 * Returns:
 *   - number ≥ 0  when a real count is known
 *   - null        when the package isn't tracked OR the count is unknown
 *                 (npm has no reliable public API for this — see scraper)
 */
export function getNpmDependentsCount(name: string): number | null {
  if (!name) return null;
  const entry = loadIndex().get(name);
  if (!entry) return null;
  return entry.count;
}
