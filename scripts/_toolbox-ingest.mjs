// StarScreener → TOOLBOX dual-write adapter.
//
// Fires HMAC-signed POSTs to TOOLBOX `/v1/signals/ingest` so trendingrepo's
// scraper outputs land in the TOOLBOX signal lake (the canonical source-of-
// truth across AISO + trendingrepo + future external customers).
//
// Per the locked hybrid topology: trendingrepo keeps its own Redis/JSONL data
// store AND dual-writes the trending.* signals to TOOLBOX. v2 retires the
// JSONL data lake once TOOLBOX reads back what trendingrepo needs.
//
// USAGE (per-source — call AFTER the script has written its primary data store)
//   import { ingestHnMentionsToToolbox, ingestRedditMentionsToToolbox } from "./_toolbox-ingest.mjs";
//   await ingestHnMentionsToToolbox(hackernewsRepoMentionsPayload);
//
// ENV (in priority order)
//   TOOLBOX_INGEST_URL          e.g. https://api.aiso.tools/v1/signals/ingest
//   TOOLBOX_INGEST_HMAC_SECRET  shared secret between trendingrepo and TOOLBOX
//
// BEHAVIOR
//   - When env unset: returns { status: "skipped" } silently. Primary data
//     store write keeps working unchanged — dual-write is best-effort.
//   - 5s timeout per call. Slow/dead TOOLBOX never blocks the scraper.
//   - Never throws — returns a status object the caller can log.
//   - Batches up to 500 events per HTTP POST (TOOLBOX's ingest max).
//
// PATTERN NOTE
//   Lifted from `aiso/lib/toolbox-ingest.ts` (commit 86ae1d0d). Same wire
//   protocol; source identifier is `"trendingrepo"` instead of `"aiso"`.

import { createHmac, randomUUID } from "node:crypto";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_EVENTS_PER_BATCH = 500;
const PRODUCED_BY = "trendingrepo";

/**
 * Low-level: POST a batch of events to TOOLBOX. Never throws.
 *
 * @param {Array<ToolboxEvent>} events
 * @returns {Promise<{status: "ok"|"skipped"|"failed", http_status?: number, duration_ms?: number, error?: string, accepted?: number, rejected?: number}>}
 */
export async function postToolboxEvents(events) {
  const url = process.env.TOOLBOX_INGEST_URL?.trim();
  const secret = process.env.TOOLBOX_INGEST_HMAC_SECRET?.trim();
  if (!url || !secret) return { status: "skipped", reason: "env_unset" };
  if (!Array.isArray(events) || events.length === 0) {
    return { status: "skipped", reason: "no_events" };
  }

  // Batch — TOOLBOX accepts max 500 events per request.
  if (events.length > MAX_EVENTS_PER_BATCH) {
    const results = [];
    for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
      const slice = events.slice(i, i + MAX_EVENTS_PER_BATCH);
      results.push(await postToolboxEvents(slice));
    }
    const ok = results.every((r) => r.status === "ok");
    const accepted = results.reduce((n, r) => n + (r.accepted ?? 0), 0);
    const rejected = results.reduce((n, r) => n + (r.rejected ?? 0), 0);
    return {
      status: ok ? "ok" : "failed",
      accepted,
      rejected,
      batches: results.length,
    };
  }

  const body = JSON.stringify({ source: "trendingrepo", events });
  const sig =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
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
    const duration_ms = Date.now() - startedAt;
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      // ignore — body parse failures don't change the outcome
    }
    return {
      status: res.ok ? "ok" : "failed",
      http_status: res.status,
      duration_ms,
      accepted: parsed?.accepted,
      rejected: parsed?.rejected,
    };
  } catch (err) {
    return {
      status: "failed",
      duration_ms: Date.now() - startedAt,
      error: err.message ?? String(err),
    };
  }
}

/**
 * Transform trendingrepo HN repo-mentions payload → TOOLBOX events.
 *
 * One event per repo, signal_type=`trending.hn.mentions`. The repo's
 * GitHub URL is the target. Normalized array carries 7-day metrics + a
 * truncated stories list (keeps each event well under the 2MB body cap).
 *
 * @param {object} payload  Output shape of scrape-hackernews.mjs (mentions map keyed by fullName)
 * @returns {Array<ToolboxEvent>}
 */
export function hnMentionsToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const mentions = payload.mentions;
  if (!mentions || typeof mentions !== "object") return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const [fullName, m] of Object.entries(mentions)) {
    if (typeof fullName !== "string" || !fullName.includes("/")) continue;
    if (!m || typeof m !== "object") continue;

    const targetUrl = `https://github.com/${fullName}`;
    // Cap stories to 10 per repo to stay safely under per-event budget.
    const stories = Array.isArray(m.stories) ? m.stories.slice(0, 10) : [];

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: "trending.hn.mentions",
      normalized: [
        { key: "count_7d", value: m.count7d ?? 0, confidence: 1.0 },
        { key: "score_sum_7d", value: m.scoreSum7d ?? 0, confidence: 1.0 },
        {
          key: "ever_hit_front_page",
          value: !!m.everHitFrontPage,
          confidence: 1.0,
        },
        ...(m.topStory
          ? [{ key: "top_story", value: m.topStory, confidence: 1.0 }]
          : []),
        { key: "stories_top10", value: stories, confidence: 1.0 },
      ],
      produced_by: `${PRODUCED_BY}-hn`,
      produced_at: producedAt,
    });
  }

  return events;
}

/**
 * Transform trendingrepo Reddit repo-mentions payload → TOOLBOX events.
 *
 * Same shape contract as HN: one event per repo, signal_type=
 * `trending.reddit.mentions`. Mentions dict is keyed by GitHub fullName.
 *
 * @param {object} payload  Output shape of scrape-reddit.mjs
 * @returns {Array<ToolboxEvent>}
 */
export function redditMentionsToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const mentions = payload.mentions;
  if (!mentions || typeof mentions !== "object") return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const [fullName, m] of Object.entries(mentions)) {
    if (typeof fullName !== "string" || !fullName.includes("/")) continue;
    if (!m || typeof m !== "object") continue;

    const targetUrl = `https://github.com/${fullName}`;
    const posts = Array.isArray(m.posts) ? m.posts.slice(0, 10) : [];

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: "trending.reddit.mentions",
      normalized: [
        { key: "count_7d", value: m.count7d ?? 0, confidence: 1.0 },
        { key: "score_sum_7d", value: m.scoreSum7d ?? 0, confidence: 1.0 },
        ...(m.topPost
          ? [{ key: "top_post", value: m.topPost, confidence: 1.0 }]
          : []),
        { key: "posts_top10", value: posts, confidence: 1.0 },
      ],
      produced_by: `${PRODUCED_BY}-reddit`,
      produced_at: producedAt,
    });
  }

  return events;
}

/**
 * Convenience wrappers — transform + POST in one call. Use these from scrape
 * scripts after the primary data store write succeeds.
 */
export async function ingestHnMentionsToToolbox(payload) {
  const events = hnMentionsToEvents(payload);
  return postToolboxEvents(events);
}

export async function ingestRedditMentionsToToolbox(payload) {
  const events = redditMentionsToEvents(payload);
  return postToolboxEvents(events);
}

/**
 * @typedef {object} ToolboxEvent
 * @property {string} scan_id
 * @property {string} target_url
 * @property {string} signal_type
 * @property {Array<{key:string, value:unknown, confidence:number}>} normalized
 * @property {string} produced_by
 * @property {string} produced_at
 * @property {number} [cost_usd]
 */
