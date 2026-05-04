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
import {
  writeDataStore,
  readDataStore,
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

async function appendOne(fullName, token) {
  const slug = payloadSlug(fullName);
  const existing = await readDataStore(slug);
  const currentStars = await fetchCurrentStars(fullName, token);
  const next = appendToday(
    existing && typeof existing === "object"
      ? { ...existing, repoId: fullName }
      : null,
    currentStars,
  );
  // Ensure repoId is canonical even when bootstrapping a fresh payload.
  next.repoId = fullName;
  await writeDataStore(slug, next, { stampPerRecord: false });
  return next;
}

async function main() {
  const args = parseArgs();
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

  let ok = 0;
  let failed = 0;
  for (const fullName of repos) {
    try {
      const next = await appendOne(fullName, token);
      console.log(
        `[ok] ${fullName} points=${next.points.length} latest=${next.points[next.points.length - 1].s}`,
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${fullName}: ${err?.message ?? err}`);
    }
  }

  console.log(`[append-star-activity] done — ok=${ok} failed=${failed}`);
  await closeDataStore();
  if (failed > 0 && ok === 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[append-star-activity] fatal", err);
    process.exit(1);
  });
