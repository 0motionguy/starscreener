// T2.6: per-source metadata sidecar.
//
// Each scrape script writes a small JSON file at data/_meta/<source>.json
// alongside its main output. Downstream consumers (the SRE freshness probe,
// the UI's "stale data" badge, alerting rules) can distinguish three states
// that look identical in the main JSON:
//   - "ok"             → source returned items, scrape succeeded
//   - "empty_results"  → source returned 0 items legitimately (quiet day)
//   - "network_error"  → upstream API was unreachable / threw
//   - "partial"        → some items returned, some sources/queries failed
//
// Without this, "no new HN stories for 3h" reads the same as "Algolia is
// down" — both leave a stale main JSON and no signal of WHY.
//
// Usage:
//   import { writeSourceMeta } from "./_data-meta.mjs";
//   await writeSourceMeta({
//     source: "hackernews",
//     reason: "ok",        // "ok" | "empty_results" | "network_error" | "partial"
//     count: items.length,
//     durationMs: Date.now() - started,
//   });

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const META_DIR = resolve(process.cwd(), "data/_meta");

const VALID_REASONS = new Set([
  "ok",
  "empty_results",
  "network_error",
  "partial",
]);

/**
 * @param {object} opts
 * @param {string} opts.source                    e.g. "hackernews", "bluesky", "reddit"
 * @param {"ok"|"empty_results"|"network_error"|"partial"} opts.reason
 * @param {number} [opts.count]                   number of items in the main output
 * @param {number} [opts.durationMs]              wall-clock duration of the scrape
 * @param {string} [opts.error]                   short error summary for non-ok states
 * @param {Record<string, unknown>} [opts.extra]  free-form context for the UI / alert
 */
export async function writeSourceMeta({
  source,
  reason,
  count,
  durationMs,
  error,
  extra,
}) {
  if (!source || typeof source !== "string") {
    throw new Error("writeSourceMeta: 'source' is required");
  }
  if (!VALID_REASONS.has(reason)) {
    throw new Error(
      `writeSourceMeta: invalid reason='${reason}', expected one of ${[...VALID_REASONS].join(", ")}`,
    );
  }

  const out = {
    source,
    reason,
    ts: new Date().toISOString(),
    ...(typeof count === "number" ? { count } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
    ...(error ? { error } : {}),
    ...(extra ? { extra } : {}),
  };

  const path = resolve(META_DIR, `${source}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(out, null, 2) + "\n", "utf8");
  return out;
}

/**
 * Helper for scripts that wrap their whole flow in a try/catch — call this
 * once at the very end (in finally) and it picks the right reason from the
 * outcome shape. Pass `count: 0` + a non-empty error to flag network_error;
 * `count: 0` alone reads as empty_results.
 */
export async function writeSourceMetaFromOutcome({
  source,
  count,
  durationMs,
  error,
  partialFailures = 0,
  extra,
}) {
  let reason;
  if (error) {
    reason = "network_error";
  } else if (partialFailures > 0 && count > 0) {
    reason = "partial";
  } else if (count === 0) {
    reason = "empty_results";
  } else {
    reason = "ok";
  }
  return writeSourceMeta({
    source,
    reason,
    count,
    durationMs,
    error: error ? String(error?.message ?? error) : undefined,
    extra: { ...(partialFailures ? { partialFailures } : {}), ...extra },
  });
}
