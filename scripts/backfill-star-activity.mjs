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
import {
  writeDataStore,
  readDataStore,
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

async function fetchPage(fullName, page, token) {
  const url = `${GITHUB_API}/repos/${fullName}/stargazers?per_page=${PAGE_SIZE}&page=${page}`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  return res;
}

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

  // Repos beyond the 400-page list cap are unreachable for backfill.
  if (lastPage >= PAGE_LIST_CAP) {
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

async function main() {
  const args = parseArgs();
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  if (!token) {
    console.warn(
      "[backfill-star-activity] no GITHUB_TOKEN set — unauthenticated rate limit (60/hr) will exhaust quickly",
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

  const startedAt = Date.now();
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyDone = 0;

  for (const fullName of repos) {
    try {
      // Resume support — if the repo already has a real backfilled payload
      // (>0 points OR explicitly snapshot-only), skip the API walk. The
      // operator can force a re-walk by omitting --skip-existing.
      if (args.skipExisting) {
        const existing = await readDataStore(payloadSlug(fullName));
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
      const result = await backfillOne(fullName, token);
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
        await writeDataStore(payloadSlug(fullName), result.payload, {
          stampPerRecord: false,
        });
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
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-star-activity] fatal", err);
    process.exit(1);
  });
