// Disk-backed Tavily query cache.
//
// The cross-source sweep hits Tavily once per repo per run. On a 4×/day,
// top-50 schedule that's ~6,000 calls/month — well past the 1k/mo free tier.
// Most queries are stable (`"owner/name" github`) so a 24h cache deflates
// the burn rate ~75%.
//
// Schema (single JSON file, merged on every write):
//   {
//     "owner/name": {
//       "ts": "2026-05-07T...",  // when results were observed
//       "results": [...]         // raw Mention[] payload as cached
//     },
//     ...
//   }
//
// TTL: read returns null when entry is >24h old; write trims entries >48h
// during the merge so the file doesn't grow unbounded.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = resolve(__dirname, "..", ".tmp", "tavily-cache.json");

const READ_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const WRITE_TRIM_MS = 48 * 60 * 60 * 1000; // 48h

async function loadCache() {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    // Corrupt JSON or permission issue — start fresh, don't block the sweep.
    console.warn(`[xs:tavily:cache] read failed (${err.message}); starting empty`);
    return {};
  }
}

function isFresh(entry, now) {
  if (!entry || typeof entry.ts !== "string") return false;
  const t = Date.parse(entry.ts);
  if (!Number.isFinite(t)) return false;
  return now - t < READ_TTL_MS;
}

/**
 * Return cached Tavily results for `repo.fullName` if observed <24h ago.
 * @param {{ fullName: string }} repo
 * @param {string} _key  reserved for future per-query cache keys
 * @returns {Promise<unknown[] | null>}
 */
export async function getCachedTavily(repo, _key) {
  if (!repo?.fullName) return null;
  const cache = await loadCache();
  const entry = cache[repo.fullName];
  if (!isFresh(entry, Date.now())) return null;
  return Array.isArray(entry.results) ? entry.results : null;
}

/**
 * Persist Tavily results for `repo.fullName`. Merges into the existing file
 * and trims entries older than 48h so the cache stays bounded.
 * @param {{ fullName: string }} repo
 * @param {string} _key  reserved for future per-query cache keys
 * @param {unknown[]} results  Mention[] (or compatible shape) to cache
 */
export async function setCachedTavily(repo, _key, results) {
  if (!repo?.fullName) return;
  const cache = await loadCache();
  const now = Date.now();
  // Trim stale entries before writing.
  for (const [k, v] of Object.entries(cache)) {
    const t = v && typeof v.ts === "string" ? Date.parse(v.ts) : NaN;
    if (!Number.isFinite(t) || now - t > WRITE_TRIM_MS) {
      delete cache[k];
    }
  }
  cache[repo.fullName] = {
    ts: new Date(now).toISOString(),
    results: Array.isArray(results) ? results : [],
  };
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n", "utf8");
  } catch (err) {
    // Cache write failures must never break the sweep.
    console.warn(`[xs:tavily:cache] write failed (${err.message})`);
  }
}
