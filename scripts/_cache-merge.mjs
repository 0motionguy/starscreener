// StarScreener — keep-last-50 cache merge helper for collectors.
//
// Per docs/INGESTION.md "RULE: Keep-last-50 cache (2026-05-08)":
// collectors must merge new + existing, dedupe by id, sort by score/recency,
// keep top N (default 50), and never shrink the cache below
// min(N, existing.length) — even on API failure or empty upstream.
//
// USAGE
//   import { mergeAndKeepLastN, loadExistingJson } from "./_cache-merge.mjs";
//
//   const existing = await loadExistingJson("data/foo.json", []);
//   const merged = mergeAndKeepLastN(existing, thisRun, {
//     idKey: "id",
//     scoreKey: "score",
//     keepN: 50,
//   });
//   await writeFile("data/foo.json", JSON.stringify(merged), "utf8");
//
// BEHAVIOR
//   - On ENOENT (first run / file absent): returns the fallback (default []).
//   - Union by idKey; on collision keep higher scoreKey (or newer on tie).
//   - Sort: scoreKey desc, recencyKey desc as tiebreak.
//   - Slice formula:
//       target = min(union.length, keepN)
//       floor  = min(keepN, existing.length)   ← survives empty upstream
//       slice  = max(target, floor)
//   - This guarantees: never write fewer than min(keepN, existing.length).
//
// NON-GOALS
//   - This helper does NOT do the file write. Caller writes after merging
//     (lets caller decide JSON shape, indentation, dual-write to Redis, etc.).
//   - This helper does NOT enforce time-based cutoffs. Caller filters
//     existing pre-call if a "drop posts older than 7d" rule applies.

import { readFile } from "node:fs/promises";

export const KEEP_LAST_N_DEFAULT = 50;

/**
 * Coerce a score field to a number. Numbers pass through. Strings parse as
 * numeric first (so "123" → 123), then as ISO-8601 dates (so a publishedAt
 * field is usable as a primary sort key). Anything that doesn't yield a
 * finite number falls back to 0 — matching the prior contract for missing
 * values. Used for both scoreKey and recencyKey.
 *
 * Historical bug this fixes: `Number("2026-05-30T05:42Z")` is NaN, which made
 * the funding-news merge a no-op (every entry tied at NaN, insertion order
 * won, fresh signals were dropped). After this change, ISO-string scoreKeys
 * rank by chronology DESC as intended. Backward-compat: existing numeric
 * scoreKeys are unchanged.
 */
function coerceNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (value == null) return 0;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/**
 * Read + parse a JSON file. Returns `fallback` on ENOENT. Logs and returns
 * `fallback` on any other read/parse error so a corrupt file never blocks a
 * collector run.
 *
 * @param {string} path absolute or cwd-relative file path
 * @param {*} fallback default value when file missing / unreadable (default: [])
 */
export async function loadExistingJson(path, fallback = []) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    console.warn(`[cache-merge] load failed for ${path}: ${err.message}`);
    return fallback;
  }
}

/**
 * Merge `thisRun` into `existing`, dedupe by `idKey`, sort by `scoreKey` (desc)
 * with optional `recencyKey` (desc) tiebreak, then slice to enforce the
 * keep-last-N rule from docs/INGESTION.md.
 *
 * @param {Array} existing previous-run entries (or [] on first run)
 * @param {Array} thisRun  freshly-fetched batch
 * @param {Object} [opts]
 * @param {string} [opts.idKey="id"]      property used to dedupe
 * @param {string} [opts.scoreKey="score"] numeric property to sort by (desc)
 * @param {string|null} [opts.recencyKey] optional tiebreak property (desc)
 * @param {number} [opts.keepN=50]        target cap; never shrinks below
 *                                        min(keepN, existing.length)
 * @returns {Array} merged + sorted + sliced
 */
export function mergeAndKeepLastN(existing, thisRun, opts = {}) {
  const {
    idKey = "id",
    scoreKey = "score",
    recencyKey = null,
    keepN = KEEP_LAST_N_DEFAULT,
  } = opts;

  const existingArr = Array.isArray(existing) ? existing : [];
  const newArr = Array.isArray(thisRun) ? thisRun : [];

  const byId = new Map();
  for (const item of existingArr) {
    const id = item?.[idKey];
    if (id == null) continue;
    byId.set(id, item);
  }
  for (const item of newArr) {
    const id = item?.[idKey];
    if (id == null) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, item);
      continue;
    }
    const newScore = coerceNumeric(item?.[scoreKey]);
    const prevScore = coerceNumeric(prev?.[scoreKey]);
    // Keep the higher-scored version; on tie, prefer newer (item).
    byId.set(id, newScore >= prevScore ? item : prev);
  }

  const sorted = Array.from(byId.values()).sort((a, b) => {
    const scoreCmp = coerceNumeric(b?.[scoreKey]) - coerceNumeric(a?.[scoreKey]);
    if (scoreCmp !== 0) return scoreCmp;
    if (recencyKey) {
      return coerceNumeric(b?.[recencyKey]) - coerceNumeric(a?.[recencyKey]);
    }
    return 0;
  });

  // Slice formula per the rule. floor guarantees survival of empty upstream.
  const target = Math.min(sorted.length, keepN);
  const floor = Math.min(keepN, existingArr.length);
  const sliceLimit = Math.max(target, floor);
  return sorted.slice(0, sliceLimit);
}
