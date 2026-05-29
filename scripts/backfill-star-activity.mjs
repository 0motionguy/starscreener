#!/usr/bin/env node
// TrendingRepo — one-shot backfill of full-history star-activity payloads.
//
// For every tracked repo, walks the GitHub stargazer endpoint to reconstruct
// a complete daily cumulative-star series and writes the result to Redis
// under `ss:data:v1:star-activity:{owner}__{name}`. Repos whose star count
// exceeds GitHub's 400-page list cap (~40,000 stars) are written as empty
// payloads marked `backfillSource: "snapshot-only"` so the read side knows
// to expect a forward-only series.
//
// Rate-limit-aware: aborts a per-repo walk when remaining < RATE_LIMIT_FLOOR
// to preserve quota for the scheduled crons. Aborted repos are written
// with whatever was reconstructed up to that point and flagged
// `coversFirstStar: false`.
//
// USAGE
//   GITHUB_TOKEN=ghp_... REDIS_URL=redis://... node scripts/backfill-star-activity.mjs
//   ... --repos vercel/next.js,anthropics/claude-code   (subset)
//   ... --limit 50                                       (cap repo count)
//   ... --dry-run                                        (skip writes)

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./_load-env.mjs";
import {
  writeDataStore,
  readDataStore,
  readDataStoreMany,
  closeDataStore,
} from "./_data-store-write.mjs";
import { loadTrackedReposFromFiles } from "./_tracked-repos.mjs";

// A long backfill (~hours) is killed by any transient unhandled rejection.
// Log + survive so the loop continues; per-repo errors are caught inside
// main() and reported as `[fail]` lines.
process.on("unhandledRejection", (err) => {
  console.error("[backfill-star-activity] unhandledRejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("[backfill-star-activity] uncaughtException:", err);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRENDING_FILE = resolve(ROOT, "data", "trending.json");
const RECENT_REPOS_FILE = resolve(ROOT, "data", "recent-repos.json");
const MANUAL_REPOS_FILE = resolve(ROOT, "data", "manual-repos.json");

const GITHUB_API = "https://api.github.com";
const PAGE_SIZE = 100;
// GitHub caps every paginated list at 400 pages. For stargazers that means
// repos with > 40,000 stars cannot have their recent history walked at all.
const PAGE_LIST_CAP = 400;
// Preserve quota for other callers (the hourly metadata cron, the live UI).
const RATE_LIMIT_FLOOR = 200;
// Pause between page fetches to avoid burst-tripping abuse-detection.
const PAGE_DELAY_MS = 50;

function parseArgs() {
  const args = {
    repos: null,
    limit: null,
    offset: 0,
    dryRun: false,
    skipExisting: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--skip-existing") args.skipExisting = true;
    else if (a === "--repos" && argv[i + 1]) {
      args.repos = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--limit" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) args.limit = n;
    } else if (a === "--offset" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n >= 0) args.offset = n;
    }
  }
  return args;
}

function buildHeaders(token) {
  return {
    Accept: "application/vnd.github.star+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "TrendingRepo-StarActivity",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function parseLastPage(linkHeader) {
  if (!linkHeader) return 1;
  const m = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  if (!m) return 1;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function readRateLimit(headers) {
  const raw = headers.get("x-ratelimit-remaining");
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchPage(fullName, page, token, direction = "asc") {
  // GitHub's stargazers list supports direction=asc|desc. Default ASC
  // returns oldest stargazers first. DESC returns newest first. Both
  // directions share the same 400-page hard cap — we exploit that for
  // dual-ended backfill on >40k-star repos (B8): walk 1..400 ASC for the
  // oldest 40k stargazers + 1..400 DESC for the newest 40k, merge by
  // `starred_at` day-bucket. Yields full coverage up to ~80k stars.
  const directionParam = direction === "desc" ? "&direction=desc" : "";
  const url = `${GITHUB_API}/repos/${fullName}/stargazers?per_page=${PAGE_SIZE}&page=${page}${directionParam}`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  return res;
}

/**
 * Walk pages 1..maxPages in one direction, accumulating per-day buckets
 * into `perDay`. Aborts cleanly when rate-limit remaining falls below
 * the floor. Returns the page count actually walked.
 */
async function walkPages({
  fullName,
  token,
  direction,
  maxPages,
  perDay,
  initialRem,
  startPage = 1,
}) {
  let pagesWalked = 0;
  let abortedEarly = false;
  let lastRem = initialRem;

  for (let page = startPage; page <= maxPages; page++) {
    if (lastRem !== null && lastRem < RATE_LIMIT_FLOOR) {
      abortedEarly = true;
      break;
    }
    if (PAGE_DELAY_MS > 0 && (page > startPage || pagesWalked > 0)) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
    const res = await fetchPage(fullName, page, token, direction);
    lastRem = readRateLimit(res.headers);
    if (!res.ok) {
      throw new Error(
        `${direction} page ${page} of ${fullName} failed: ${res.status} ${res.statusText}`,
      );
    }
    let data;
    try {
      data = await res.json();
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;
    bucketByDay(data, perDay);
    pagesWalked += 1;
    if (data.length < PAGE_SIZE) break;
  }

  return { pagesWalked, lastRem, abortedEarly };
}

// 2026-05-15 (B8): dual-ended backfill for repos beyond the 400-page
// GitHub stargazer-list cap. Default ON; set
// `BACKFILL_STAR_ACTIVITY_DUAL_ENDED=false` to fall back to the legacy
// snapshot-only payload.
const DUAL_ENDED_DEFAULT_ON =
  (process.env.BACKFILL_STAR_ACTIVITY_DUAL_ENDED ?? "true")
    .trim()
    .toLowerCase() !== "false";

function bucketByDay(entries, perDay) {
  for (const entry of entries) {
    if (!entry || typeof entry.starred_at !== "string") continue;
    const day = entry.starred_at.slice(0, 10); // YYYY-MM-DD
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
}

function buildPoints(perDay) {
  // Sort keys ascending; emit cumulative running total + per-day delta.
  const keys = Array.from(perDay.keys()).sort();
  const out = [];
  let running = 0;
  for (const d of keys) {
    const delta = perDay.get(d) ?? 0;
    running += delta;
    out.push({ d, s: running, delta });
  }
  return out;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function backfillOne(fullName, token) {
  // Probe page 1 to read the Link header (last page count).
  const probe = await fetchPage(fullName, 1, token);
  const probeRem = readRateLimit(probe.headers);
  if (!probe.ok) {
    throw new Error(
      `probe ${fullName} failed: ${probe.status} ${probe.statusText}`,
    );
  }
  const lastPage = parseLastPage(probe.headers.get("link"));

  // Repos beyond the 400-page list cap (>~40k stars).
  if (lastPage >= PAGE_LIST_CAP) {
    if (!DUAL_ENDED_DEFAULT_ON) {
      // Legacy fallback: empty payload, marked snapshot-only.
      return {
        payload: {
          repoId: fullName,
          points: [],
          firstObservedAt: new Date().toISOString(),
          backfillSource: "snapshot-only",
          coversFirstStar: false,
          updatedAt: new Date().toISOString(),
        },
        pagesWalked: 1,
        rateLimitRemaining: probeRem,
        reachedFirstStar: false,
      };
    }

    // Dual-ended walk: oldest 40k via ASC + newest 40k via DESC.
    const perDayDual = new Map();
    // Re-use the probe payload as ASC page 1 (we already paid for it).
    try {
      const probeData = await probe.json();
      if (Array.isArray(probeData)) bucketByDay(probeData, perDayDual);
    } catch {
      // probe parse failure is non-fatal — walkPages will retry page 1.
    }

    // ASC: pages 2..PAGE_LIST_CAP (page 1 came from the probe).
    const asc = await walkPages({
      fullName,
      token,
      direction: "asc",
      maxPages: PAGE_LIST_CAP,
      perDay: perDayDual,
      initialRem: probeRem,
      startPage: 2,
    });

    // DESC: pages 1..PAGE_LIST_CAP. Skip if ASC aborted to preserve
    // rate-limit budget for the next repo in the batch.
    let desc = { pagesWalked: 0, lastRem: asc.lastRem, abortedEarly: false };
    if (!asc.abortedEarly) {
      desc = await walkPages({
        fullName,
        token,
        direction: "desc",
        maxPages: PAGE_LIST_CAP,
        perDay: perDayDual,
        initialRem: asc.lastRem,
        startPage: 1,
      });
    }

    const totalPagesWalked = 1 + asc.pagesWalked + desc.pagesWalked;
    const points = buildPoints(perDayDual);
    if (points.length > 0) {
      const today = todayUtc();
      if (points[points.length - 1].d !== today) {
        points.push({ d: today, s: points[points.length - 1].s, delta: 0 });
      }
    }

    // coversFirstStar=false because dual-ended explicitly has a middle
    // gap for repos beyond ~80k stars. The earliest observed point IS
    // genuinely the first star (ASC direction starts at created_at=0)
    // but downstream classification logic treats coversFirstStar as
    // "complete coverage" so we report the more conservative value.
    return {
      payload: {
        repoId: fullName,
        points,
        firstObservedAt: new Date().toISOString(),
        backfillSource: "dual-ended",
        coversFirstStar: false,
        updatedAt: new Date().toISOString(),
      },
      pagesWalked: totalPagesWalked,
      rateLimitRemaining: desc.lastRem,
      reachedFirstStar: false,
    };
  }

  const perDay = new Map();
  let pagesWalked = 0;
  let abortedEarly = false;

  // Consume the probe page's body so we don't re-fetch page 1.
  try {
    const data = await probe.json();
    if (Array.isArray(data)) {
      bucketByDay(data, perDay);
      pagesWalked = 1;
    }
  } catch {
    // probe parse failure is non-fatal — continue with page 2.
  }

  let lastRem = probeRem;
  for (let page = 2; page <= lastPage; page++) {
    if (lastRem !== null && lastRem < RATE_LIMIT_FLOOR) {
      abortedEarly = true;
      break;
    }
    if (PAGE_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
    const res = await fetchPage(fullName, page, token);
    lastRem = readRateLimit(res.headers);
    if (!res.ok) {
      throw new Error(
        `page ${page} of ${fullName} failed: ${res.status} ${res.statusText}`,
      );
    }
    let data;
    try {
      data = await res.json();
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;
    bucketByDay(data, perDay);
    pagesWalked += 1;
    // Short-circuit on the last (partial) page — saves one fetch when GH
    // returns < PAGE_SIZE entries before we expected the run to end.
    if (data.length < PAGE_SIZE) break;
  }

  // If perDay has entries but doesn't include today, append a "today" point
  // mirroring the latest cumulative — the chart shows a flat tail rather
  // than ending mid-yesterday.
  const points = buildPoints(perDay);
  if (points.length > 0) {
    const today = todayUtc();
    if (points[points.length - 1].d !== today) {
      points.push({ d: today, s: points[points.length - 1].s, delta: 0 });
    }
  }

  return {
    payload: {
      repoId: fullName,
      points,
      firstObservedAt: new Date().toISOString(),
      backfillSource: "stargazer-api",
      coversFirstStar: !abortedEarly,
      updatedAt: new Date().toISOString(),
    },
    pagesWalked,
    rateLimitRemaining: lastRem,
    reachedFirstStar: !abortedEarly,
  };
}

function payloadSlug(fullName) {
  return `star-activity:${fullName.toLowerCase().replace("/", "__")}`;
}

function hasWritableDataStoreEnv() {
  if (
    process.env.DATA_STORE_DISABLE === "1" ||
    process.env.DATA_STORE_DISABLE === "true"
  ) {
    return false;
  }
  if (process.env.REDIS_URL?.trim()) return true;
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function assertWritableDataStoreEnv() {
  if (hasWritableDataStoreEnv()) return;
  throw new Error(
    "star-activity backfill requires REDIS_URL or Upstash env; refusing to fetch GitHub data when the data-store write would be skipped",
  );
}

function assertReadBackMatches(slug, expected, actual) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error(`${slug}: read-after-write returned no object payload`);
  }

  const actualPoints = Array.isArray(actual.points) ? actual.points : [];
  const expectedPoints = Array.isArray(expected.points) ? expected.points : [];
  const actualLast = actualPoints[actualPoints.length - 1];
  const expectedLast = expectedPoints[expectedPoints.length - 1];

  if (
    actual.repoId !== expected.repoId ||
    actual.updatedAt !== expected.updatedAt ||
    actual.backfillSource !== expected.backfillSource ||
    actualPoints.length !== expectedPoints.length ||
    actualLast?.d !== expectedLast?.d ||
    actualLast?.s !== expectedLast?.s
  ) {
    throw new Error(`${slug}: read-after-write payload mismatch`);
  }
}

async function writeAndVerifyStarActivity(slug, payload) {
  const result = await writeDataStore(slug, payload, {
    stampPerRecord: false,
  });
  if (result.source !== "redis") {
    throw new Error(`${slug}: data-store write skipped`);
  }
  const readBack = await readDataStore(slug);
  assertReadBackMatches(slug, payload, readBack);
  return result;
}

async function main() {
  const args = parseArgs();
  if (!args.dryRun) {
    assertWritableDataStoreEnv();
  }
  // Token pool: GH_TOKEN_POOL (comma-separated, ~20 tokens) is rotated
  // per-repo so a single token's secondary-rate-limit (GitHub returns 403 on
  // rapid multi-page stargazer pagination) can't sink the whole batch — the
  // exact failure mode that 403'd 149/150 established repos on 2026-05-29.
  // Falls back to a single GITHUB_TOKEN / GH_TOKEN.
  const tokenPool = (process.env.GH_TOKEN_POOL ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokenPool.length === 0) {
    const single = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    if (single) tokenPool.push(single);
  }
  if (tokenPool.length === 0) {
    console.warn(
      "[backfill-star-activity] no GH_TOKEN_POOL/GITHUB_TOKEN — unauthenticated rate limit (60/hr) will exhaust quickly",
    );
  }
  let tokenCursor = 0;
  const nextToken = () => {
    if (tokenPool.length === 0) return "";
    const t = tokenPool[tokenCursor % tokenPool.length];
    tokenCursor += 1;
    return t;
  };
  console.log(
    `[backfill-star-activity] token pool size=${tokenPool.length}`,
  );

  let repos;
  if (args.repos && args.repos.length > 0) {
    repos = args.repos;
  } else {
    const tracked = await loadTrackedReposFromFiles({
      trendingPath: TRENDING_FILE,
      recentPath: RECENT_REPOS_FILE,
      manualPath: MANUAL_REPOS_FILE,
      log: (msg) => console.warn(`[backfill-star-activity] ${msg}`),
    });
    repos = Array.from(tracked.values());
  }
  if (args.offset > 0) repos = repos.slice(args.offset);
  if (args.limit && repos.length > args.limit) {
    repos = repos.slice(0, args.limit);
  }

  console.log(
    `[backfill-star-activity] starting (${repos.length} repos, dry-run=${args.dryRun}, skip-existing=${args.skipExisting})`,
  );

  // B.15 Arc 2 extension — when --skip-existing is on, pre-load every repo's
  // existing payload via batched MGET at startup instead of doing N
  // per-repo readDataStore calls inside the main loop. For 2,980 repos this
  // turns ~2,980 GETs into ~30 MGET pipeline calls (one per chunk of 100)
  // = 99% Upstash request reduction on the skip-check path. The per-repo
  // write at end-of-walk stays sequential (each follows a 30s-5min GitHub
  // walk; batching saves negligibly there).
  const existingBySlug = new Map();
  if (args.skipExisting) {
    const CHUNK = 100;
    const slugs = repos.map((fullName) => payloadSlug(fullName));
    console.log(
      `[backfill-star-activity] pre-loading ${slugs.length} existing payloads via MGET (chunks of ${CHUNK})`,
    );
    for (let start = 0; start < slugs.length; start += CHUNK) {
      const slugChunk = slugs.slice(start, start + CHUNK);
      try {
        const values = await readDataStoreMany(slugChunk);
        for (let i = 0; i < slugChunk.length; i += 1) {
          existingBySlug.set(slugChunk[i], values[i]);
        }
      } catch (err) {
        // Don't abort backfill on MGET failure — fall back to the original
        // per-repo readDataStore for any unresolved slug below.
        console.warn(
          `[backfill-star-activity] MGET chunk start=${start} failed (${err?.message ?? err}); will fall back per-repo`,
        );
      }
    }
  }

  const startedAt = Date.now();
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyDone = 0;

  for (const fullName of repos) {
    try {
      // Resume support — if the repo already has a real backfilled payload
      // (>0 points OR explicitly snapshot-only), skip the API walk. The
      // operator can force a re-walk by omitting --skip-existing. Lookup
      // hits the pre-loaded MGET map first; falls back to per-repo readDataStore
      // when the slug wasn't in any successful chunk.
      if (args.skipExisting) {
        const slug = payloadSlug(fullName);
        let existing = existingBySlug.get(slug);
        if (existing === undefined) {
          existing = await readDataStore(slug);
        }
        if (
          existing &&
          typeof existing === "object" &&
          (Array.isArray(existing.points) && existing.points.length > 0 ||
            existing.backfillSource === "snapshot-only")
        ) {
          alreadyDone += 1;
          console.log(`[done] ${fullName} already has payload — skipping`);
          continue;
        }
      }
      // Rotate a fresh token per repo + retry on 403/429 (secondary rate
      // limit) by advancing to the next token in the pool.
      let result;
      let attempts = 0;
      const maxAttempts = Math.min(4, tokenPool.length || 1);
      for (;;) {
        try {
          result = await backfillOne(fullName, nextToken());
          break;
        } catch (e) {
          attempts += 1;
          const msg = String(e?.message ?? e);
          if (attempts < maxAttempts && /\b(403|429)\b/.test(msg)) {
            console.warn(
              `[retry] ${fullName}: ${msg} — rotating token (${attempts}/${maxAttempts})`,
            );
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw e;
        }
      }
      if (result.payload.backfillSource === "snapshot-only") {
        skipped += 1;
        console.log(
          `[skip] ${fullName} exceeds list cap (forward-only payload written)`,
        );
      } else {
        console.log(
          `[ok]   ${fullName} points=${result.payload.points.length} ` +
            `pages=${result.pagesWalked} ` +
            `covers=${result.payload.coversFirstStar} ` +
            `rl=${result.rateLimitRemaining}`,
        );
      }
      if (!args.dryRun) {
        await writeAndVerifyStarActivity(payloadSlug(fullName), result.payload);
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${fullName}: ${err?.message ?? err}`);
    }
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[backfill-star-activity] done in ${elapsedSec}s — ok=${ok} skipped=${skipped} failed=${failed} already=${alreadyDone}`,
  );
  await closeDataStore();
  if (failed > 0 && ok === 0 && alreadyDone === 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[backfill-star-activity] fatal", err);
    process.exitCode = 1;
  });
