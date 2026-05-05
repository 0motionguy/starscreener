#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { writeDataStore } from "./_data-store-write.mjs";
import { writeSourceMeta } from "./_data-meta.mjs";

const ROOT = process.cwd();
const TRENDING_FILE = resolve(ROOT, "data", "trending.json");
const PROFILES_FILE = resolve(ROOT, "data", "repo-profiles.json");
const OUT_FILE = resolve(ROOT, "data", "repo-profile-coverage.json");

const DEFAULT_LIMIT = 200;
const DEFAULT_RESCAN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgInt(name, fallback, min, max) {
  const prefix = `--${name}=`;
  const token = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!token) return fallback;
  const raw = token.slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizeRepoKey(fullName) {
  return String(fullName ?? "").trim().toLowerCase();
}

function collectTopTrending(trending, limit) {
  const rows = trending?.buckets?.past_24_hours?.All ?? [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const fullName = row?.repo_name;
    if (!fullName || !fullName.includes("/")) continue;
    const key = normalizeRepoKey(fullName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fullName, key });
    if (out.length >= limit) break;
  }
  return out;
}

function buildProfileIndex(repoProfiles) {
  const map = new Map();
  for (const profile of repoProfiles?.profiles ?? []) {
    const key = normalizeRepoKey(profile?.fullName);
    if (!key || !key.includes("/")) continue;
    map.set(key, profile);
  }
  return map;
}

function parseIsoMs(value) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

function rankBand(rank) {
  if (!Number.isFinite(rank)) return "unranked";
  if (rank <= 50) return "top_1_50";
  if (rank <= 200) return "top_51_200";
  if (rank <= 500) return "top_201_500";
  return "top_501_plus";
}

function ageBucket(lastProfiledMs, nowMs) {
  if (!Number.isFinite(lastProfiledMs)) return "unknown";
  const ageDays = (nowMs - lastProfiledMs) / DAY_MS;
  if (ageDays <= 7) return "lte_7d";
  if (ageDays <= 30) return "d8_30";
  return "gt_30d";
}

async function main() {
  const startedAt = Date.now();
  const limit = parseArgInt("limit", DEFAULT_LIMIT, 1, 2000);
  const rescanDays = parseArgInt("rescan-days", DEFAULT_RESCAN_DAYS, 1, 90);
  const staleWindowMs = rescanDays * 24 * 60 * 60 * 1000;

  const [trending, repoProfiles] = await Promise.all([
    readJson(TRENDING_FILE, { buckets: {} }),
    readJson(PROFILES_FILE, { profiles: [] }),
  ]);

  const topTrending = collectTopTrending(trending, limit);
  const profileByRepo = buildProfileIndex(repoProfiles);
  const nowMs = Date.now();

  let covered = 0;
  let scanned = 0;
  let queued = 0;
  let failed = 0;
  let noWebsite = 0;
  let stale = 0;
  const missing = [];
  const staleRepos = [];
  const segmentByStatus = {};
  const segmentByRankBand = {
    top_1_50: 0,
    top_51_200: 0,
    top_201_500: 0,
    top_501_plus: 0,
    unranked: 0,
  };
  const segmentByStalenessBucket = {
    lte_7d: 0,
    d8_30: 0,
    gt_30d: 0,
    unknown: 0,
  };

  for (const profile of repoProfiles?.profiles ?? []) {
    const status = String(profile?.status ?? "unknown");
    segmentByStatus[status] = (segmentByStatus[status] ?? 0) + 1;
    segmentByRankBand[rankBand(Number(profile?.rank))] += 1;
    segmentByStalenessBucket[ageBucket(parseIsoMs(profile?.lastProfiledAt), nowMs)] += 1;
  }

  for (const repo of topTrending) {
    const profile = profileByRepo.get(repo.key);
    if (!profile) {
      missing.push(repo.fullName);
      continue;
    }

    covered += 1;
    const status = String(profile.status ?? "unknown");
    if (status === "scanned") scanned += 1;
    else if (status === "scan_pending" || status === "scan_running" || status === "rate_limited") queued += 1;
    else if (status === "scan_failed") failed += 1;
    else if (status === "no_website") noWebsite += 1;

    const lastProfiledMs = parseIsoMs(profile.lastProfiledAt);
    const nextScanMs = parseIsoMs(profile.nextScanAfter);
    const isStale =
      status === "scanned" &&
      ((nextScanMs !== null && nextScanMs <= nowMs) ||
        (lastProfiledMs !== null && nowMs - lastProfiledMs > staleWindowMs));
    if (isStale) {
      stale += 1;
      staleRepos.push({
        fullName: profile.fullName ?? repo.fullName,
        lastProfiledAt: profile.lastProfiledAt ?? null,
        nextScanAfter: profile.nextScanAfter ?? null,
      });
    }
  }

  const coveragePct = topTrending.length > 0 ? (covered / topTrending.length) * 100 : 0;
  const staleOver7d = segmentByStalenessBucket.d8_30 + segmentByStalenessBucket.gt_30d;
  const payload = {
    generatedAt: new Date().toISOString(),
    input: {
      topTrendingLimit: limit,
      rescanDays,
      trendingCount: topTrending.length,
    },
    summary: {
      totalProfiles: repoProfiles?.profiles?.length ?? 0,
      coveredRepos: covered,
      missingRepos: topTrending.length - covered,
      coveragePct: Number(coveragePct.toFixed(2)),
      scanned,
      queued,
      failed,
      noWebsite,
      staleScanned: stale,
      staleOver7d,
    },
    segments: {
      byStatus: segmentByStatus,
      byRankBand: segmentByRankBand,
      byStalenessAgeBucket: segmentByStalenessBucket,
    },
    staleBacklog: staleRepos.slice(0, 100),
    missingBacklog: missing.slice(0, 100),
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeDataStore("repo-profile-coverage", payload);

  const reason = stale > 0 || missing.length > 0 || failed > 0 ? "partial" : "ok";
  await writeSourceMeta({
    source: "repo-profiles",
    reason,
    count: covered,
    durationMs: Date.now() - startedAt,
    extra: {
      topTrendingCount: topTrending.length,
      missingCount: missing.length,
      staleCount: stale,
      failedCount: failed,
      staleOver7d,
      rescanDays,
    },
  });

  console.log(
    `repo-profile-coverage: top=${topTrending.length} covered=${covered} missing=${missing.length} scanned=${scanned} stale=${stale} failed=${failed}`,
  );
}

main().catch((error) => {
  console.error(`verify-repo-profile-coverage failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
