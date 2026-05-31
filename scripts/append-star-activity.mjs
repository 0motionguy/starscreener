#!/usr/bin/env node
// TrendingRepo — daily forward-append for star-activity payloads.
//
// Adds one new cumulative point to each tracked repo's star-activity payload
// per UTC day. Cheap: one /repos/{owner}/{name} call per repo (returns
// `stargazers_count` directly — no pagination). Idempotent: if today already
// has a point, replaces it with the latest count rather than duplicating.
//
// Designed to run on a daily cron AFTER the metadata cron has updated
// repo state. Repos that the backfill marked `backfillSource: "snapshot-only"`
// (over the 40k-star list cap) accumulate forward history here over time.
// Repos that don't yet have any payload are bootstrapped with a single
// "today" point so the chart never has to handle null.
//
// USAGE
//   GITHUB_TOKEN=ghp_... REDIS_URL=redis://... node scripts/append-star-activity.mjs
//   ... --repos vercel/next.js,anthropics/claude-code   (subset)

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./_load-env.mjs";
import {
  readDataStoreMany,
  writeDataStoreMany,
  closeDataStore,
} from "./_data-store-write.mjs";
import { loadTrackedReposFromFiles } from "./_tracked-repos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRENDING_FILE = resolve(ROOT, "data", "trending.json");
const RECENT_REPOS_FILE = resolve(ROOT, "data", "recent-repos.json");
const MANUAL_REPOS_FILE = resolve(ROOT, "data", "manual-repos.json");

const GITHUB_API = "https://api.github.com";

function parseArgs() {
  const args = { repos: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repos" && argv[i + 1]) {
      args.repos = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return args;
}

function buildHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "TrendingRepo-StarActivity",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
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
    "star-activity append requires REDIS_URL or Upstash env; refusing to fetch GitHub data when the data-store write would be skipped",
  );
}

async function fetchCurrentStars(fullName, token) {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    throw new Error(
      `repo metadata ${fullName} failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = await res.json();
  if (typeof data?.stargazers_count !== "number") {
    throw new Error(`${fullName}: stargazers_count missing from response`);
  }
  return data.stargazers_count;
}

/**
 * Append (or replace) today's point on `payload`. Returns the updated payload.
 * Mutating-style return because the caller writes it straight back to Redis.
 */
function appendToday(payload, currentStars) {
  const today = todayUtc();
  const points = Array.isArray(payload?.points) ? [...payload.points] : [];
  const last = points[points.length - 1];
  const prevStars = last?.s ?? 0;
  const delta = currentStars - prevStars;

  if (last && last.d === today) {
    // Idempotent — re-running the script same day refreshes the point.
    points[points.length - 1] = {
      d: today,
      s: currentStars,
      delta: points.length > 1 ? currentStars - points[points.length - 2].s : 0,
    };
  } else {
    points.push({ d: today, s: currentStars, delta });
  }

  return {
    repoId: payload?.repoId ?? "",
    points,
    firstObservedAt: payload?.firstObservedAt ?? new Date().toISOString(),
    backfillSource: payload?.backfillSource ?? "snapshot-only",
    coversFirstStar: payload?.coversFirstStar ?? false,
    updatedAt: new Date().toISOString(),
  };
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
    actualPoints.length !== expectedPoints.length ||
    actualLast?.d !== expectedLast?.d ||
    actualLast?.s !== expectedLast?.s
  ) {
    throw new Error(`${slug}: read-after-write payload mismatch`);
  }
}

// B.15 Arc 2 — batched append for a chunk of repos.
//
// Per-chunk Redis-request budget (against Upstash limits):
//   1 × MGET                (existing payload reads, N keys)
//   1 × pipeline.exec()     (2N SETs: payload + meta per entry)
//   1 × MGET (verify)       (read-back, N keys)
//   = 3 Upstash requests for N repos (vs. 4N in the sequential loop).
//
// At N=100, 2980 repos → 30 chunks × 3 requests = 90 requests for the
// full run vs. ~11,920 for the per-repo loop.
//
// Errors are isolated per repo:
//   - GitHub fetch fail → repo recorded as failure, others continue
//   - MGET partial (some null) → bootstrap from null is normal, treated ok
//   - Pipeline per-entry SET fail → recorded, other entries proceed
//   - Verify mismatch → recorded as failure
//
// Returns: { ok: string[], failed: Array<{ repo: string, reason: string }> }
async function appendChunk(repos, token) {
  if (!Array.isArray(repos) || repos.length === 0) {
    return { ok: [], failed: [] };
  }
  const ok = [];
  const failed = [];
  const slugs = repos.map(payloadSlug);

  // Phase 1 — batched read of existing payloads (1 Upstash request).
  let existings;
  try {
    existings = await readDataStoreMany(slugs);
  } catch (err) {
    // Treat as full-chunk MGET failure — fall back to bootstrap-from-null
    // for every repo. The write/verify path is still tried so the next
    // run has fresh state.
    console.warn(`[chunk] MGET failed (${err?.message ?? err}); bootstrapping null`);
    existings = repos.map(() => null);
  }

  // Phase 2 — parallel GitHub fetches. Each call is independent + token-pooled
  // upstream. Promise.allSettled so one 5xx doesn't kill the chunk.
  const fetchSettled = await Promise.allSettled(
    repos.map((fullName) => fetchCurrentStars(fullName, token)),
  );

  // Phase 3 — build new payloads from (existing, currentStars).
  const newPayloads = new Array(repos.length).fill(null);
  for (let i = 0; i < repos.length; i += 1) {
    const fullName = repos[i];
    const settle = fetchSettled[i];
    if (settle.status !== "fulfilled") {
      failed.push({ repo: fullName, reason: `fetchCurrentStars: ${settle.reason?.message ?? settle.reason}` });
      continue;
    }
    const currentStars = settle.value;
    const existing = existings[i];
    const next = appendToday(
      existing && typeof existing === "object"
        ? { ...existing, repoId: fullName }
        : null,
      currentStars,
    );
    next.repoId = fullName;
    newPayloads[i] = next;
  }

  // Phase 4 — batched write via pipeline.exec (1 Upstash request).
  const entriesToWrite = [];
  const entryIndexByKey = new Map();
  for (let i = 0; i < repos.length; i += 1) {
    if (newPayloads[i] === null) continue;
    const slug = slugs[i];
    entriesToWrite.push({ key: slug, value: newPayloads[i] });
    entryIndexByKey.set(slug, i);
  }
  if (entriesToWrite.length === 0) {
    return { ok, failed };
  }

  let writeResult;
  try {
    writeResult = await writeDataStoreMany(entriesToWrite, { stampPerRecord: false });
  } catch (err) {
    // Full pipeline failure — record everyone in the chunk as failed.
    for (const e of entriesToWrite) {
      failed.push({ repo: repos[entryIndexByKey.get(e.key)], reason: `pipeline: ${err?.message ?? err}` });
    }
    return { ok, failed };
  }
  if (writeResult.source !== "redis") {
    for (const e of entriesToWrite) {
      failed.push({ repo: repos[entryIndexByKey.get(e.key)], reason: "data-store write skipped" });
    }
    return { ok, failed };
  }

  // Phase 5 — batched read-back verify (1 Upstash request).
  const verifySlugs = entriesToWrite.map((e) => e.key);
  let readBacks;
  try {
    readBacks = await readDataStoreMany(verifySlugs);
  } catch (err) {
    // Verify failure ≠ write failure — log soft + still count writes as ok.
    console.warn(`[chunk] readback MGET failed (${err?.message ?? err}); skipping per-entry verify`);
    readBacks = entriesToWrite.map(() => undefined);
  }

  for (let i = 0; i < entriesToWrite.length; i += 1) {
    const entry = entriesToWrite[i];
    const expected = entry.value;
    const fullName = repos[entryIndexByKey.get(entry.key)];
    const writeStatus = writeResult.results[i];
    if (!writeStatus?.ok) {
      failed.push({ repo: fullName, reason: `write: ${writeStatus?.error ?? "unknown"}` });
      continue;
    }
    // If we couldn't verify (MGET failed), trust the pipeline SET success.
    if (readBacks[i] === undefined) {
      ok.push(fullName);
      continue;
    }
    try {
      assertReadBackMatches(entry.key, expected, readBacks[i]);
      ok.push(fullName);
    } catch (err) {
      failed.push({ repo: fullName, reason: `verify: ${err?.message ?? err}` });
    }
  }

  return { ok, failed };
}

async function main() {
  const args = parseArgs();
  assertWritableDataStoreEnv();
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  if (!token) {
    console.warn(
      "[append-star-activity] no GITHUB_TOKEN — unauthenticated 60/hr will exhaust fast",
    );
  }

  let repos;
  if (args.repos && args.repos.length > 0) {
    repos = args.repos;
  } else {
    const tracked = await loadTrackedReposFromFiles({
      trendingPath: TRENDING_FILE,
      recentPath: RECENT_REPOS_FILE,
      manualPath: MANUAL_REPOS_FILE,
      log: (msg) => console.warn(`[append-star-activity] ${msg}`),
    });
    repos = Array.from(tracked.values());
  }

  console.log(`[append-star-activity] appending today's point for ${repos.length} repos`);

  // B.15 Arc 2 — chunked batched append. Default N=100 keeps each pipeline
  // payload + MGET response well under Upstash's 10MB-per-response limit
  // (~30KB per star-activity payload × 100 = ~3MB worst case).
  const CHUNK_SIZE = Number(process.env.APPEND_STAR_ACTIVITY_CHUNK_SIZE) || 100;
  let ok = 0;
  let failed = 0;
  for (let start = 0; start < repos.length; start += CHUNK_SIZE) {
    const chunk = repos.slice(start, start + CHUNK_SIZE);
    const chunkIdx = Math.floor(start / CHUNK_SIZE) + 1;
    const chunkTotal = Math.ceil(repos.length / CHUNK_SIZE);
    console.log(
      `[chunk ${chunkIdx}/${chunkTotal}] processing ${chunk.length} repos (start=${start})`,
    );
    const result = await appendChunk(chunk, token);
    for (const repo of result.ok) {
      ok += 1;
      // One-line per-success log preserved for parity with the legacy loop —
      // operators piping output to grep still get a `[ok] <name>` row.
      console.log(`[ok] ${repo}`);
    }
    for (const fail of result.failed) {
      failed += 1;
      console.error(`[fail] ${fail.repo}: ${fail.reason}`);
    }
  }

  console.log(`[append-star-activity] done — ok=${ok} failed=${failed}`);
  await closeDataStore();
  if (failed > 0 && ok === 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[append-star-activity] fatal", err);
    process.exitCode = 1;
  });
