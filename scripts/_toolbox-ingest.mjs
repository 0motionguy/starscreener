// trendingrepo → TOOLBOX dual-write helper (Phase A.3).
//
// Fire-and-forget HMAC-signed POST to TOOLBOX `/v1/signals/ingest`. Called
// from `scripts/_data-store-write.mjs` after each successful Redis write so
// that real production scrape traffic populates the TOOLBOX signal lake in
// parallel with the existing storage.
//
// CONFIG (env)
//   TOOLBOX_INGEST_URL          e.g. https://api.aiso.tools/v1/signals/ingest
//   TOOLBOX_INGEST_HMAC_SECRET  matches /opt/toolbox/.env on the VPS
//
// When either is unset → ingestToToolbox() returns {status:"skipped"}, no POST.
// 5 s timeout. Errors are caught + returned in the result object; never thrown.
//
// MAPPING
//   The dataset → signal_type mapping currently lives in mapDatasetToEvents().
//   Each enabled mapping emits one or more TOOLBOX events per Redis write.
//   Datasets without a mapping return [] and produce no POST.

import { createHmac } from "node:crypto";

const REQUEST_TIMEOUT_MS = 5_000;
const SOURCE = "trendingrepo";

/**
 * Map a (dataset key, payload) pair from `writeDataStore()` to TOOLBOX
 * events. Return [] for datasets we haven't mapped yet — they'll skip
 * the POST entirely. Add cases here as we migrate sources to TOOLBOX.
 *
 * @param {string} key       The dataset slug, e.g. "hackernews-repo-mentions"
 * @param {unknown} payload  The value passed to writeDataStore()
 * @param {string} writtenAt ISO timestamp when the Redis write completed
 * @returns {Array<object>}  TOOLBOX events conforming to ingest schema
 */
export function mapDatasetToEvents(key, payload, writtenAt) {
  // TODO(toolbox-mapping): fill in concrete dataset → signal_type mappings.
  // Examples to wire next:
  //   hackernews-repo-mentions → trending.hn.mentions (target=repo URL)
  //   reddit-mentions          → trending.reddit.mentions
  //   twitter-trending         → social.x.mentions
  // Each event needs: scan_id, target_url, signal_type, normalized[], produced_by, produced_at.
  void key;
  void payload;
  void writtenAt;
  return [];
}

/**
 * POST events to TOOLBOX. Returns a status object — never throws.
 * Disabled when env vars unset OR events array is empty.
 *
 * @param {Array<object>} events
 * @returns {Promise<{status: "ok"|"skipped"|"failed", http_status?: number, duration_ms?: number, error?: string}>}
 */
export async function ingestToToolbox(events) {
  const url = process.env.TOOLBOX_INGEST_URL;
  const secret = process.env.TOOLBOX_INGEST_HMAC_SECRET;
  if (!url || !secret) return { status: "skipped" };
  if (!Array.isArray(events) || events.length === 0) return { status: "skipped" };

  const body = JSON.stringify({ source: SOURCE, events });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-toolbox-signature": sig,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return {
      status: res.ok ? "ok" : "failed",
      http_status: res.status,
      duration_ms: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      status: "failed",
      duration_ms: Date.now() - startedAt,
      error: err && err.message ? err.message : String(err),
    };
  }
}
