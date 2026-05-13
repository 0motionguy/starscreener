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
 * Push a normalized entry only if its value is non-null and non-undefined.
 * Required because TOOLBOX `tb_signals.value` is `jsonb NOT NULL`. Sending a
 * JS `null` materializes as SQL `NULL`, which fails the constraint and kills
 * the whole event's persistence (single batch INSERT). Silent skip is correct
 * because the missing field carries no information anyway.
 */
function pushNormalized(arr, key, value, confidence) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && value.length === 0) {
    // Empty strings are OK — they materialize as JSON "" which is non-null.
    arr.push({ key, value, confidence });
    return;
  }
  arr.push({ key, value, confidence });
}

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
 * Transform trendingrepo Bluesky repo-mentions payload → TOOLBOX events.
 *
 * One event per repo, signal_type=`trending.bluesky.mentions`. Bluesky-
 * specific metrics: likes, reposts, replies aggregated over 7d window.
 *
 * @param {object} payload  Output shape of scrape-bluesky.mjs (mentions map keyed by fullName)
 * @returns {Array<ToolboxEvent>}
 */
export function bskyMentionsToEvents(payload) {
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
      signal_type: "trending.bluesky.mentions",
      normalized: [
        { key: "count_7d", value: m.count7d ?? 0, confidence: 1.0 },
        { key: "likes_sum_7d", value: m.likesSum7d ?? 0, confidence: 1.0 },
        { key: "reposts_sum_7d", value: m.repostsSum7d ?? 0, confidence: 1.0 },
        { key: "replies_sum_7d", value: m.repliesSum7d ?? 0, confidence: 1.0 },
        ...(m.topPost
          ? [{ key: "top_post", value: m.topPost, confidence: 1.0 }]
          : []),
        { key: "posts_top10", value: posts, confidence: 1.0 },
      ],
      produced_by: `${PRODUCED_BY}-bluesky`,
      produced_at: producedAt,
    });
  }

  return events;
}

/**
 * Transform trendingrepo dev.to repo-mentions payload → TOOLBOX events.
 *
 * One event per repo, signal_type=`trending.devto.mentions`. dev.to-specific
 * metrics: reactions, comments aggregated over 7d window.
 *
 * @param {object} payload  Output shape of scrape-devto.mjs
 * @returns {Array<ToolboxEvent>}
 */
export function devtoMentionsToEvents(payload) {
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
    const articles = Array.isArray(m.articles)
      ? m.articles.slice(0, 10)
      : [];

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: "trending.devto.mentions",
      normalized: [
        { key: "count_7d", value: m.count7d ?? 0, confidence: 1.0 },
        { key: "reactions_sum_7d", value: m.reactionsSum7d ?? 0, confidence: 1.0 },
        { key: "comments_sum_7d", value: m.commentsSum7d ?? 0, confidence: 1.0 },
        ...(m.topArticle
          ? [{ key: "top_article", value: m.topArticle, confidence: 1.0 }]
          : []),
        { key: "articles_top10", value: articles, confidence: 1.0 },
      ],
      produced_by: `${PRODUCED_BY}-devto`,
      produced_at: producedAt,
    });
  }

  return events;
}

/**
 * Transform trendingrepo Product Hunt launches payload → TOOLBOX events.
 *
 * One event per launch, signal_type=`trending.producthunt.launches`.
 * Target URL is the launch's product page URL (or website if available).
 */
export function producthuntLaunchesToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const launches = payload.launches;
  if (!Array.isArray(launches)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const launch of launches) {
    if (!launch || typeof launch !== "object") continue;
    const targetUrl = String(launch.url ?? launch.website ?? "");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) continue;

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: "trending.producthunt.launches",
      normalized: [
        { key: "id", value: launch.id ?? null, confidence: 1.0 },
        { key: "name", value: launch.name ?? "", confidence: 1.0 },
        { key: "tagline", value: launch.tagline ?? "", confidence: 1.0 },
        { key: "votes_count", value: launch.votesCount ?? 0, confidence: 1.0 },
        { key: "comments_count", value: launch.commentsCount ?? 0, confidence: 1.0 },
        { key: "created_at", value: launch.createdAt ?? "", confidence: 1.0 },
        ...(launch.topics ? [{ key: "topics", value: launch.topics, confidence: 1.0 }] : []),
        ...(launch.makers ? [{ key: "makers", value: launch.makers, confidence: 1.0 }] : []),
        ...(launch.thumbnail ? [{ key: "thumbnail", value: launch.thumbnail, confidence: 1.0 }] : []),
      ],
      produced_by: `${PRODUCED_BY}-producthunt`,
      produced_at: producedAt,
    });
  }
  return events;
}

/**
 * Generic HuggingFace transformer used by models/spaces/datasets variants.
 */
function huggingfaceToEvents(payload, kind, cap = 100) {
  if (!payload || typeof payload !== "object") return [];
  const items = payload[kind];
  if (!Array.isArray(items)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const signalType = `trending.huggingface.${kind}`;
  const events = [];

  for (const item of items.slice(0, cap)) {
    if (!item || typeof item !== "object") continue;
    const targetUrl = String(item.url ?? "");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) continue;

    const normalized = [
      { key: "id", value: item.id ?? "", confidence: 1.0 },
      { key: "rank", value: item.rank ?? null, confidence: 1.0 },
      { key: "author", value: item.author ?? "", confidence: 1.0 },
      { key: "likes", value: item.likes ?? 0, confidence: 1.0 },
      { key: "trending_score", value: item.trendingScore ?? 0, confidence: 1.0 },
    ];
    if (typeof item.downloads === "number") {
      normalized.push({ key: "downloads", value: item.downloads, confidence: 1.0 });
    }
    if (item.pipelineTag) {
      normalized.push({ key: "pipeline_tag", value: item.pipelineTag, confidence: 1.0 });
    }
    if (item.sdk) {
      normalized.push({ key: "sdk", value: item.sdk, confidence: 1.0 });
    }
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      normalized.push({ key: "tags", value: item.tags.slice(0, 20), confidence: 1.0 });
    }
    if (Array.isArray(item.models) && item.models.length > 0) {
      normalized.push({ key: "models", value: item.models.slice(0, 10), confidence: 1.0 });
    }

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: signalType,
      normalized,
      produced_by: `${PRODUCED_BY}-huggingface`,
      produced_at: producedAt,
    });
  }
  return events;
}

export function huggingfaceModelsToEvents(payload) {
  return huggingfaceToEvents(payload, "models", 100);
}
export function huggingfaceSpacesToEvents(payload) {
  return huggingfaceToEvents(payload, "spaces", 50);
}
export function huggingfaceDatasetsToEvents(payload) {
  return huggingfaceToEvents(payload, "datasets", 50);
}

/**
 * Transform trendingrepo npm packages payload → TOOLBOX events.
 *
 * One event per package, target=npmjs URL; linkedRepo captured as normalized.
 */
export function npmPackagesToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const packages = payload.packages;
  if (!Array.isArray(packages)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const pkg of packages) {
    if (!pkg || typeof pkg !== "object") continue;
    const targetUrl = String(pkg.npmUrl ?? "");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) continue;

    const normalized = [
      { key: "name", value: pkg.name ?? "", confidence: 1.0 },
      { key: "latest_version", value: pkg.latestVersion ?? "", confidence: 1.0 },
      { key: "published_at", value: pkg.publishedAt ?? "", confidence: 1.0 },
      { key: "description", value: pkg.description ?? "", confidence: 1.0 },
    ];
    if (pkg.repositoryUrl) normalized.push({ key: "repository_url", value: pkg.repositoryUrl, confidence: 1.0 });
    if (pkg.linkedRepo) normalized.push({ key: "linked_repo", value: pkg.linkedRepo, confidence: 1.0 });
    if (pkg.homepage) normalized.push({ key: "homepage", value: pkg.homepage, confidence: 1.0 });
    if (pkg.downloads) normalized.push({ key: "downloads", value: pkg.downloads, confidence: 1.0 });
    if (Array.isArray(pkg.keywords) && pkg.keywords.length > 0) {
      normalized.push({ key: "keywords", value: pkg.keywords.slice(0, 20), confidence: 1.0 });
    }

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: "trending.npm.packages",
      normalized,
      produced_by: `${PRODUCED_BY}-npm`,
      produced_at: producedAt,
    });
  }
  return events;
}

/**
 * Transform OpenAI RSS items → TOOLBOX events.
 *
 * One event per RSS item, target=canonical article URL on openai.com.
 */
export function openaiRssToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const items = payload.items;
  if (!Array.isArray(items)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const targetUrl = String(item.url ?? "");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) continue;

    events.push({
      scan_id: scanId,
      target_url: targetUrl,
      signal_type: "content.openai.announcements",
      normalized: [
        { key: "id", value: item.id ?? "", confidence: 1.0 },
        { key: "title", value: item.title ?? "", confidence: 1.0 },
        { key: "summary", value: (item.summary ?? "").slice(0, 1000), confidence: 1.0 },
        { key: "published_at", value: item.publishedAt ?? "", confidence: 1.0 },
        { key: "author", value: item.author ?? "", confidence: 1.0 },
        { key: "category", value: item.category ?? "", confidence: 1.0 },
        { key: "source", value: item.source ?? "openai.com", confidence: 1.0 },
      ],
      produced_by: `${PRODUCED_BY}-openai-rss`,
      produced_at: producedAt,
    });
  }
  return events;
}

/**
 * Transform compute-deltas data/deltas.json → TOOLBOX events.
 *
 * One event per repo for `trending.github.stars.velocity` (and a second one
 * for `trending.github.fork.velocity` when fork data is present).
 *
 * `data/deltas.json` is keyed by GitHub repo ID (numeric); we resolve each ID
 * to its `owner/name` via `data/repo-metadata.json` (already produced by
 * scrape-trending). Repos missing from metadata are skipped.
 *
 * @param {object} payload         Output of compute-deltas.mjs (data/deltas.json)
 * @param {object} repoMetadata    Output of scrape-trending (data/repo-metadata.json)
 * @returns {Array<ToolboxEvent>}
 */
export function deltasToEvents(payload, repoMetadata) {
  if (!payload || typeof payload !== "object") return [];
  if (!payload.repos || typeof payload.repos !== "object") return [];
  if (!repoMetadata || typeof repoMetadata !== "object") return [];

  // Build id->fullName map. Production repo-metadata.json shape is
  // `{ fetchedAt, sourceCount, items: [{ githubId, fullName, ... }, ...] }`.
  // Tolerate `{ repos: [{ id, full_name }] }` + flat object shapes too.
  const idToFullName = new Map();
  let metaRepos;
  if (Array.isArray(repoMetadata.items)) {
    metaRepos = repoMetadata.items;
  } else if (Array.isArray(repoMetadata.repos)) {
    metaRepos = repoMetadata.repos;
  } else {
    metaRepos = Object.values(repoMetadata);
  }
  for (const r of metaRepos) {
    if (!r || typeof r !== "object") continue;
    const id = r.githubId ?? r.id ?? r.repoId;
    const fullName = r.fullName ?? r.full_name;
    if (id != null && typeof fullName === "string" && fullName.includes("/")) {
      idToFullName.set(String(id), fullName);
    }
  }

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const [repoId, deltas] of Object.entries(payload.repos)) {
    if (!deltas || typeof deltas !== "object") continue;
    const fullName = idToFullName.get(String(repoId));
    if (!fullName) continue;
    const targetUrl = `https://github.com/${fullName}`;

    // Stars-velocity event. Use pushNormalized to skip null delta values
    // (basis="repo-not-tracked" / "no-history" entries); jsonb NOT NULL.
    // `_age_seconds` is emitted only for cold-start basis, where
    // compute-deltas.mjs populates `age_seconds = now - picked_ts`.
    const starsNormalized = [];
    pushNormalized(starsNormalized, "stars_now", deltas.stars_now ?? 0, 1.0);
    for (const win of ["1h", "24h", "7d", "30d"]) {
      const d = deltas[`delta_${win}`];
      if (d && typeof d === "object") {
        const conf = d.basis === "exact" ? 1.0 : d.basis === "nearest" ? 0.7 : 0.5;
        pushNormalized(starsNormalized, `delta_${win}`, d.value, conf);
        pushNormalized(starsNormalized, `delta_${win}_basis`, d.basis, 1.0);
        if (typeof d.age_seconds === "number") {
          pushNormalized(starsNormalized, `delta_${win}_age_seconds`, d.age_seconds, 1.0);
        }
      }
    }
    if (starsNormalized.length > 0) {
      events.push({
        scan_id: scanId,
        target_url: targetUrl,
        signal_type: "trending.github.stars.velocity",
        normalized: starsNormalized,
        produced_by: `${PRODUCED_BY}-deltas`,
        produced_at: producedAt,
      });
    }

    // Fork-velocity event — only when forks_now is present (future-proof).
    // Mirror the stars-velocity shape: emit value + basis + age_seconds so
    // toolbox-store-velocity.ts can resolve the discriminated DeltaValue
    // union without stubbing (kills the trade-off notes 1 and 2 in that
    // file's header).
    if (typeof deltas.forks_now === "number") {
      const forkNormalized = [];
      pushNormalized(forkNormalized, "forks_now", deltas.forks_now, 1.0);
      for (const win of ["1h", "24h", "7d", "30d"]) {
        const d = deltas[`fork_delta_${win}`];
        if (d && typeof d === "object") {
          pushNormalized(forkNormalized, `fork_delta_${win}`, d.value, 0.7);
          pushNormalized(forkNormalized, `fork_delta_${win}_basis`, d.basis, 1.0);
          if (typeof d.age_seconds === "number") {
            pushNormalized(forkNormalized, `fork_delta_${win}_age_seconds`, d.age_seconds, 1.0);
          }
        }
      }
      if (forkNormalized.length > 0) {
        events.push({
          scan_id: scanId,
          target_url: targetUrl,
          signal_type: "trending.github.fork.velocity",
          normalized: forkNormalized,
          produced_by: `${PRODUCED_BY}-deltas`,
          produced_at: producedAt,
        });
      }
    }
  }

  return events;
}

/**
 * Transform OSSInsight scrape-trending data/trending.json → TOOLBOX events.
 *
 * `data/trending.json` is `{ buckets: { period: { language: [rows...] } } }`.
 * We flatten to one event per unique repo, with appearance metadata (which
 * period+language buckets it ranked in, and where) in the normalized array.
 *
 * Cap to top 200 unique repos by appearance count to keep batch volume sane.
 *
 * @param {object} payload  Output of scrape-trending.mjs
 * @returns {Array<ToolboxEvent>}
 */
export function ossInsightTrendingToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const buckets = payload.buckets;
  if (!buckets || typeof buckets !== "object") return [];

  const repoMap = new Map(); // fullName -> { stars, appearances: [...] }
  for (const [period, langBuckets] of Object.entries(buckets)) {
    if (!langBuckets || typeof langBuckets !== "object") continue;
    for (const [language, rows] of Object.entries(langBuckets)) {
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, idx) => {
        if (!row || typeof row !== "object") return;
        const fullName = String(row.repo_name ?? "");
        if (!fullName.includes("/")) return;
        if (!repoMap.has(fullName)) {
          repoMap.set(fullName, { stars: 0, appearances: [] });
        }
        const entry = repoMap.get(fullName);
        const stars = typeof row.stars === "number" ? row.stars : 0;
        if (stars > entry.stars) entry.stars = stars;
        entry.appearances.push({
          period,
          language,
          rank: idx + 1,
          total_score: row.total_score ?? 0,
        });
      });
    }
  }

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const sorted = [...repoMap.entries()]
    .sort((a, b) => b[1].appearances.length - a[1].appearances.length)
    .slice(0, 200);

  return sorted.map(([fullName, info]) => ({
    scan_id: scanId,
    target_url: `https://github.com/${fullName}`,
    signal_type: "trending.github.repos",
    normalized: [
      { key: "stars", value: info.stars, confidence: 1.0 },
      { key: "appearances_count", value: info.appearances.length, confidence: 1.0 },
      { key: "appearances_top10", value: info.appearances.slice(0, 10), confidence: 1.0 },
    ],
    produced_by: `${PRODUCED_BY}-ossinsight`,
    produced_at: producedAt,
  }));
}

/**
 * Transform npm-daily dependents map → TOOLBOX events.
 *
 * Payload shape: `{ fetchedAt, dependents: { "<package>": { count, fetchedAt } } }`.
 * One event per package with a non-null count; target = npmjs package URL.
 *
 * @param {object} payload  { fetchedAt: string, dependents: object }
 * @returns {Array<ToolboxEvent>}
 */
export function npmDependentsToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const dependents = payload.dependents;
  if (!dependents || typeof dependents !== "object") return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const [pkgName, info] of Object.entries(dependents)) {
    if (!pkgName || typeof pkgName !== "string") continue;
    if (!info || typeof info !== "object") continue;
    if (typeof info.count !== "number") continue; // skip null/unknown

    events.push({
      scan_id: scanId,
      target_url: `https://www.npmjs.com/package/${pkgName}`,
      signal_type: "trending.npm.dependents",
      normalized: [
        { key: "package", value: pkgName, confidence: 1.0 },
        { key: "dependents_count", value: info.count, confidence: 1.0 },
        { key: "fetched_at", value: info.fetchedAt ?? payload.fetchedAt ?? "", confidence: 1.0 },
      ],
      produced_by: `${PRODUCED_BY}-npm-dependents`,
      produced_at: producedAt,
    });
  }

  return events;
}

/**
 * Transform funding-news payload → TOOLBOX events.
 *
 * Production payload shape: `{ fetchedAt, signals: [...] }` where each signal is
 * `{ id, headline, description, sourceUrl, sourcePlatform, publishedAt,
 * discoveredAt, extracted: { companyName, companyWebsite, companyLogoUrl,
 * amount, amountDisplay, currency, roundType, investors, investorsEnriched,
 * confidence }, tags }`.
 *
 * Target_url = canonical news article URL. If a github URL is discoverable in
 * the extracted block (rare in news but tolerated), ALSO emit a second event
 * keyed off the github URL for cross-link joins downstream.
 *
 * Uses pushNormalized to omit any null/undefined fields — tb_signals.value is
 * jsonb NOT NULL.
 *
 * @param {object} payload  Output of scrape-funding-news.mjs (data/funding-news.json)
 * @returns {Array<ToolboxEvent>}
 */
export function fundingNewsToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const signals = payload.signals;
  if (!Array.isArray(signals)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const sig of signals) {
    if (!sig || typeof sig !== "object") continue;
    const sourceUrl = String(sig.sourceUrl ?? "");
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) continue;

    const extracted = (sig.extracted && typeof sig.extracted === "object") ? sig.extracted : {};
    const normalized = [];
    pushNormalized(normalized, "headline", sig.headline, 1.0);
    pushNormalized(normalized, "company", extracted.companyName, 0.9);
    pushNormalized(normalized, "company_website", extracted.companyWebsite, 0.8);
    pushNormalized(normalized, "round_stage", extracted.roundType, 0.8);
    pushNormalized(normalized, "amount_usd", extracted.amount, 0.8);
    pushNormalized(normalized, "amount_display", extracted.amountDisplay, 0.8);
    pushNormalized(normalized, "currency", extracted.currency, 0.9);
    pushNormalized(
      normalized,
      "investors",
      Array.isArray(extracted.investors) && extracted.investors.length > 0
        ? extracted.investors.slice(0, 20)
        : null,
      0.7,
    );
    pushNormalized(normalized, "published_at", sig.publishedAt, 1.0);
    pushNormalized(normalized, "source_platform", sig.sourcePlatform, 1.0);
    pushNormalized(normalized, "extraction_confidence", extracted.confidence, 1.0);

    if (normalized.length === 0) continue;

    const baseEvent = {
      scan_id: scanId,
      target_url: sourceUrl,
      signal_type: "funding.startup",
      normalized,
      produced_by: `${PRODUCED_BY}-funding`,
      produced_at: producedAt,
    };
    events.push(baseEvent);

    // Cross-link to GitHub if discoverable. Tolerate two field names + a few
    // common ways news scrapers might surface a repo URL.
    const githubUrl = extracted.githubUrl ?? extracted.linkedRepo;
    if (typeof githubUrl === "string" && githubUrl.startsWith("https://github.com/")) {
      events.push({ ...baseEvent, target_url: githubUrl });
    }
  }

  return events;
}

/**
 * Transform SEC Form D filings payload → TOOLBOX events.
 *
 * Production shape mirrors funding-news but `extracted` adds `industryGroup`
 * (SEC's standardized industry classifier). No GitHub cross-link — SEC
 * filings rarely include repo URLs.
 *
 * Uses pushNormalized to omit any null/undefined fields — tb_signals.value is
 * jsonb NOT NULL.
 *
 * @param {object} payload  Output of scrape-sec-form-d.mjs (data/funding-news-sec.json)
 * @returns {Array<ToolboxEvent>}
 */
export function fundingSecFormdToEvents(payload) {
  if (!payload || typeof payload !== "object") return [];
  const signals = payload.signals;
  if (!Array.isArray(signals)) return [];

  const producedAt = new Date().toISOString();
  const scanId = randomUUID();
  const events = [];

  for (const sig of signals) {
    if (!sig || typeof sig !== "object") continue;
    const sourceUrl = String(sig.sourceUrl ?? "");
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) continue;

    const extracted = (sig.extracted && typeof sig.extracted === "object") ? sig.extracted : {};
    const normalized = [];
    pushNormalized(normalized, "headline", sig.headline, 1.0);
    pushNormalized(normalized, "company", extracted.companyName, 0.9);
    pushNormalized(normalized, "amount_usd", extracted.amount, 0.9);
    pushNormalized(normalized, "amount_display", extracted.amountDisplay, 0.9);
    pushNormalized(normalized, "currency", extracted.currency, 0.9);
    pushNormalized(normalized, "round_stage", extracted.roundType, 0.8);
    pushNormalized(normalized, "industry_group", extracted.industryGroup, 0.9);
    pushNormalized(normalized, "filing_date", sig.publishedAt, 1.0);
    pushNormalized(normalized, "extraction_confidence", extracted.confidence, 1.0);

    if (normalized.length === 0) continue;

    events.push({
      scan_id: scanId,
      target_url: sourceUrl,
      signal_type: "funding.sec.formd",
      normalized,
      produced_by: `${PRODUCED_BY}-sec`,
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
  return postToolboxEvents(hnMentionsToEvents(payload));
}
export async function ingestRedditMentionsToToolbox(payload) {
  return postToolboxEvents(redditMentionsToEvents(payload));
}
export async function ingestBskyMentionsToToolbox(payload) {
  return postToolboxEvents(bskyMentionsToEvents(payload));
}
export async function ingestDevtoMentionsToToolbox(payload) {
  return postToolboxEvents(devtoMentionsToEvents(payload));
}
export async function ingestProducthuntLaunchesToToolbox(payload) {
  return postToolboxEvents(producthuntLaunchesToEvents(payload));
}
export async function ingestHuggingfaceModelsToToolbox(payload) {
  return postToolboxEvents(huggingfaceModelsToEvents(payload));
}
export async function ingestHuggingfaceSpacesToToolbox(payload) {
  return postToolboxEvents(huggingfaceSpacesToEvents(payload));
}
export async function ingestHuggingfaceDatasetsToToolbox(payload) {
  return postToolboxEvents(huggingfaceDatasetsToEvents(payload));
}
export async function ingestNpmPackagesToToolbox(payload) {
  return postToolboxEvents(npmPackagesToEvents(payload));
}
export async function ingestOpenaiRssToToolbox(payload) {
  return postToolboxEvents(openaiRssToEvents(payload));
}
export async function ingestDeltasToToolbox(payload, repoMetadata) {
  return postToolboxEvents(deltasToEvents(payload, repoMetadata));
}
export async function ingestOssInsightTrendingToToolbox(payload) {
  return postToolboxEvents(ossInsightTrendingToEvents(payload));
}
export async function ingestNpmDependentsToToolbox(payload) {
  return postToolboxEvents(npmDependentsToEvents(payload));
}
export async function ingestFundingNewsToToolbox(payload) {
  return postToolboxEvents(fundingNewsToEvents(payload));
}
export async function ingestFundingSecFormdToToolbox(payload) {
  return postToolboxEvents(fundingSecFormdToEvents(payload));
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
