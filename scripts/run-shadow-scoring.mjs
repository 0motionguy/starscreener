#!/usr/bin/env node
// TrendingRepo — daily shadow-scoring runner.
//
// Reads each per-domain scored payload from the data-store (Redis primary,
// file fallback), constructs a "production" ranking from the existing
// momentum/signalScore field, and a "shadow" ranking by re-scoring with a
// slightly mutated weight bag. Writes a combined report to the
// `scoring-shadow-report` data-store key.
//
// MVP NOTE
//   The full Chunks A–F scoring pipelines emit `rawComponents` on each item,
//   which the runner could re-weight against arbitrary `shadow-weights:*`
//   bags. Until those payloads land in production, the runner falls back
//   to a deterministic perturbation: take the prod momentum, add a small
//   freshness-tilt term derived from `lastUpdated`/`postedAt`, then
//   rank-sort. This gives the comparison harness a non-trivial diff to
//   render even before any real weight tuning happens.
//
// CONFIG (env)
//   REDIS_URL                  Railway-style redis://[user:pass@]host:port
//   UPSTASH_REDIS_REST_URL     Upstash REST URL (legacy)
//   UPSTASH_REDIS_REST_TOKEN   Token for Upstash REST
//   DATA_STORE_DISABLE         "1" to skip Redis writes entirely
//
// USAGE
//   node scripts/run-shadow-scoring.mjs

import "./_load-env.mjs";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const NAMESPACE = "ss:data:v1";
// META_NAMESPACE is owned by writeDataStore() — we don't read meta here,
// the shadow runner only consumes the payload itself.

/**
 * Domains the harness compares. Each entry maps a logical domain key (used
 * inside the report) to the data-store slug we read raw items from. We keep
 * this list aligned with the trending-* keys produced by the existing
 * collectors. Greenfield slugs not yet emitting data are skipped silently.
 */
const DOMAINS = [
  { domainKey: "skill", slug: "trending-skill" },
  { domainKey: "skill", slug: "trending-skill-sh", suffix: "-sh" },
  { domainKey: "mcp", slug: "trending-mcp" },
  { domainKey: "hf-model", slug: "trending-hf-models" },
  { domainKey: "hf-dataset", slug: "trending-hf-datasets" },
  { domainKey: "hf-space", slug: "trending-hf-spaces" },
  { domainKey: "arxiv", slug: "trending-arxiv" },
];

const TOP_50 = 50;
const TOP_10 = 10;
const RANK_CHANGES_LIMIT = 20;
const CUTOVER_SPEARMAN_MIN = 0.6;
const CUTOVER_TOP10_OVERLAP_MIN = 5;
const BASELINED_DOMAINS = new Set(["skill", "mcp", "github-repo"]);

// ---------------------------------------------------------------------------
// Redis client (read-side only — write goes through writeDataStore).
// ---------------------------------------------------------------------------

let cachedReader = null;

async function getReader() {
  if (cachedReader !== null) return cachedReader;

  const disabled =
    process.env.DATA_STORE_DISABLE === "1" ||
    process.env.DATA_STORE_DISABLE === "true";
  if (disabled) {
    cachedReader = false;
    return false;
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
    });
    client.on("error", (err) => {
      console.warn(`[shadow] ioredis transport error: ${err.message}`);
    });
    cachedReader = {
      async get(key) {
        return client.get(key);
      },
      async quit() {
        try { await client.quit(); } catch { /* ignore */ }
      },
    };
    return cachedReader;
  }

  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    const client = new Redis({ url: upstashUrl, token: upstashToken });
    cachedReader = {
      async get(key) {
        return client.get(key);
      },
      async quit() { /* Upstash REST has no persistent connection */ },
    };
    return cachedReader;
  }

  cachedReader = false;
  return false;
}

async function readSnapshot(slug) {
  const reader = await getReader();
  if (reader) {
    try {
      const raw = await reader.get(`${NAMESPACE}:${slug}`);
      const parsed = parseRedisValue(raw);
      if (parsed) return { source: "redis", data: parsed };
    } catch (err) {
      console.warn(`[shadow] Redis read failed for ${slug}:`, err?.message ?? err);
    }
  }
  // File fallback. Lets the script run locally with no Redis configured.
  const filePath = resolve(process.cwd(), "data", `${slug}.json`);
  try {
    const raw = readFileSync(filePath, "utf8");
    return { source: "file", data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function parseRedisValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw === "object") return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Ranking extraction
// ---------------------------------------------------------------------------

/**
 * Coerce a heterogeneous payload into [{ id, title, momentum, freshness }].
 *
 * Walks the most common shapes we see across collectors:
 *   - { items: [{ id, title, signalScore, momentum, postedAt, lastUpdated, ... }] }
 *   - { models: [...] }, { repos: [...] }, etc.
 *
 * Returns an empty array on unparseable input — the runner downgrades the
 * domain entry rather than throwing.
 */
function extractRanking(payload) {
  if (!payload || typeof payload !== "object") return [];
  const candidates =
    arrFrom(payload.items) ??
    arrFrom(payload.models) ??
    arrFrom(payload.repos) ??
    arrFrom(payload.entries) ??
    arrFrom(payload.results) ??
    [];

  const ranking = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const id = pickStr(raw.id) ?? pickStr(raw.repo_id) ?? pickStr(raw.slug) ?? pickStr(raw.url) ?? pickStr(raw.title);
    if (!id) continue;
    const title =
      pickStr(raw.title) ??
      pickStr(raw.name) ??
      pickStr(raw.repo_name) ??
      pickStr(raw.id) ??
      id;
    const momentum =
      pickNum(raw.momentum) ??
      pickNum(raw.signalScore) ??
      pickNum(raw.trendingScore) ??
      pickNum(raw.score) ??
      0;
    const freshness =
      pickIsoMs(raw.lastUpdated) ??
      pickIsoMs(raw.postedAt) ??
      pickIsoMs(raw.lastModified) ??
      pickIsoMs(raw.updated_at) ??
      pickIsoMs(raw.createdAt) ??
      0;
    ranking.push({ id, title, momentum, freshness });
  }
  return ranking;
}

function arrFrom(v) {
  return Array.isArray(v) ? v : null;
}
function pickStr(v) {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function pickNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function pickIsoMs(v) {
  if (typeof v !== "string" || v.length === 0) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Shadow scoring (perturbed weights — MVP fallback)
// ---------------------------------------------------------------------------

/**
 * Apply a deterministic perturbation to produce a "shadow" momentum value.
 * The plan calls for boosting `freshness` by 0.05 and reducing the dominant
 * download/installs term by 0.05, then renormalizing. Without raw components
 * we approximate that effect by adding a freshness-tilt to the production
 * momentum: items pushed in the last 7 days get a small uplift, older items
 * get a small dampening, then we renormalize to 0..100.
 */
function shadowMomentum(prod, freshnessMs, nowMs) {
  if (!Number.isFinite(prod)) return 0;
  if (!freshnessMs || !Number.isFinite(freshnessMs)) {
    return prod;
  }
  const ageDays = Math.max(0, (nowMs - freshnessMs) / 86_400_000);
  // Tilt: linear ramp from +5 (just-published) to -5 (>= 30 days).
  const tilt = 5 - (ageDays / 30) * 10;
  const tiltClamped = Math.max(-5, Math.min(5, tilt));
  return Math.max(0, Math.min(100, prod + tiltClamped));
}

function buildShadowRanking(prodRanking) {
  const now = Date.now();
  return prodRanking
    .map((r) => ({
      ...r,
      momentum: shadowMomentum(r.momentum, r.freshness, now),
    }))
    .sort((a, b) => b.momentum - a.momentum);
}

// ---------------------------------------------------------------------------
// Math (mirrors src/lib/pipeline/shadow-mode.ts — duplicated here because
// .mjs cannot import .ts without a transpile step)
// ---------------------------------------------------------------------------

function averageRanks(values) {
  const n = values.length;
  if (n === 0) return [];
  const indexed = values.map((v, i) => ({
    v: Number.isFinite(v) ? v : -Infinity,
    i,
  }));
  indexed.sort((a, b) => b.v - a.v);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return 0;
  return num / Math.sqrt(dx2 * dy2);
}

function spearman(prodRanks, shadowRanks) {
  if (prodRanks.length < 2 || prodRanks.length !== shadowRanks.length) return 0;
  return pearson(prodRanks, shadowRanks);
}

function kendall(prodRanks, shadowRanks) {
  const n = prodRanks.length;
  if (n < 2) return 0;
  let c = 0, d = 0, tx = 0, ty = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = prodRanks[i] - prodRanks[j];
      const dy = shadowRanks[i] - shadowRanks[j];
      if (dx === 0 && dy === 0) { tx++; ty++; }
      else if (dx === 0) tx++;
      else if (dy === 0) ty++;
      else if (Math.sign(dx) === Math.sign(dy)) c++;
      else d++;
    }
  }
  const total = (n * (n - 1)) / 2;
  const denX = total - tx;
  const denY = total - ty;
  if (denX <= 0 || denY <= 0) return 0;
  return (c - d) / Math.sqrt(denX * denY);
}

// ---------------------------------------------------------------------------
// Report construction
// ---------------------------------------------------------------------------

function buildReport(domainKey, slug, prodRanking, shadowRanking) {
  const generatedAt = new Date().toISOString();

  const prodTop50 = prodRanking.slice(0, TOP_50).map((r, i) => ({
    id: r.id, title: r.title, momentum: r.momentum, rank: i + 1,
  }));
  const shadowTop50 = shadowRanking.slice(0, TOP_50).map((r, i) => ({
    id: r.id, title: r.title, momentum: r.momentum, rank: i + 1,
  }));

  const prodIndex = new Map();
  prodRanking.forEach((r, i) => prodIndex.set(r.id, { rank: i + 1, momentum: r.momentum, title: r.title }));
  const shadowIndex = new Map();
  shadowRanking.forEach((r, i) => shadowIndex.set(r.id, { rank: i + 1, momentum: r.momentum, title: r.title }));

  const prodPaired = [], shadowPaired = [];
  for (const [id, p] of prodIndex.entries()) {
    const s = shadowIndex.get(id);
    if (!s) continue;
    prodPaired.push(p.rank);
    shadowPaired.push(s.rank);
  }
  const prodAvg = averageRanks(prodPaired.map((r) => -r));
  const shadowAvg = averageRanks(shadowPaired.map((r) => -r));

  const spearmanRho = spearman(prodAvg, shadowAvg);
  const kendallTau = kendall(prodAvg, shadowAvg);

  // Top-50 set overlap.
  const limit = Math.min(TOP_50, prodTop50.length, shadowTop50.length);
  let overlap50 = 0;
  if (limit > 0) {
    const prodSet = new Set(prodTop50.slice(0, limit).map((e) => e.id));
    for (let i = 0; i < limit; i++) {
      if (prodSet.has(shadowTop50[i].id)) overlap50++;
    }
  }
  const setOverlapTop50 = limit > 0 ? overlap50 / limit : 0;

  // Top-10 churn.
  const prodTop10Ids = new Set(prodTop50.slice(0, TOP_10).map((e) => e.id));
  let top10Churn = 0;
  for (const e of shadowTop50.slice(0, TOP_10)) {
    if (!prodTop10Ids.has(e.id)) top10Churn++;
  }

  const rankChanges = [...prodIndex.entries()]
    .filter(([id]) => shadowIndex.has(id))
    .map(([id, p]) => {
      const s = shadowIndex.get(id);
      return {
        id,
        title: p.title || s.title,
        prodRank: p.rank,
        shadowRank: s.rank,
        delta: s.rank - p.rank,
        prodMomentum: p.momentum,
        shadowMomentum: s.momentum,
      };
    })
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, RANK_CHANGES_LIMIT);

  const top10Overlap = TOP_10 - top10Churn;
  const gate = applyGate(domainKey, spearmanRho, top10Overlap, prodTop50.length, shadowTop50.length);

  return {
    domainKey,
    sourceSlug: slug,
    prodTop50,
    shadowTop50,
    spearmanRho,
    kendallTau,
    setOverlapTop50,
    top10Churn,
    rankChanges,
    generatedAt,
    cutoverGatePass: gate.pass,
    cutoverGateReason: gate.reason,
  };
}

function applyGate(domainKey, rho, top10Overlap, prodLen, shadowLen) {
  if (!BASELINED_DOMAINS.has(domainKey)) {
    return { pass: true, reason: `domain "${domainKey}" greenfield (no v1 baseline) — gate N/A` };
  }
  if (prodLen === 0 || shadowLen === 0) {
    return { pass: true, reason: "empty ranking — gate not evaluated" };
  }
  if (rho < CUTOVER_SPEARMAN_MIN) {
    return { pass: false, reason: `Spearman ρ ${rho.toFixed(3)} < ${CUTOVER_SPEARMAN_MIN}` };
  }
  if (top10Overlap < CUTOVER_TOP10_OVERLAP_MIN) {
    return { pass: false, reason: `top-10 overlap ${top10Overlap} < ${CUTOVER_TOP10_OVERLAP_MIN}` };
  }
  return {
    pass: true,
    reason: `Spearman ρ ${rho.toFixed(3)} ≥ ${CUTOVER_SPEARMAN_MIN}, top-10 overlap ${top10Overlap}/10`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("[shadow] starting daily shadow-scoring run");
  const reports = [];
  const skipped = [];

  for (const { domainKey, slug } of DOMAINS) {
    const snapshot = await readSnapshot(slug);
    if (!snapshot) {
      skipped.push({ domainKey, slug, reason: "no data found in Redis or file" });
      continue;
    }
    const prodRanking = extractRanking(snapshot.data);
    if (prodRanking.length === 0) {
      skipped.push({ domainKey, slug, reason: "ranking extraction yielded zero items" });
      continue;
    }
    // Sort prod by momentum desc to be safe (some sources may not be pre-sorted).
    prodRanking.sort((a, b) => b.momentum - a.momentum);
    const shadowRanking = buildShadowRanking(prodRanking);
    const report = buildReport(domainKey, slug, prodRanking, shadowRanking);
    reports.push(report);
    console.log(
      `[shadow] ${slug} (${domainKey}): n=${prodRanking.length} ρ=${report.spearmanRho.toFixed(3)} τ=${report.kendallTau.toFixed(3)} top50-overlap=${(report.setOverlapTop50 * 100).toFixed(0)}% top10-churn=${report.top10Churn} gate=${report.cutoverGatePass ? "PASS" : "FAIL"}`,
    );
  }

  const outPayload = {
    generatedAt: new Date().toISOString(),
    reports,
    skipped,
    notes: {
      mvpFallback:
        "shadow ranking generated by perturbing prod momentum with a freshness tilt (±5 over 30d). Replace with raw-component re-weighting once shadow-weights:<domainKey> Redis keys are populated.",
      cutoverThresholds: {
        spearmanMin: CUTOVER_SPEARMAN_MIN,
        top10OverlapMin: CUTOVER_TOP10_OVERLAP_MIN,
        baselinedDomains: [...BASELINED_DOMAINS],
      },
    },
  };

  try {
    const result = await writeDataStore("scoring-shadow-report", outPayload);
    console.log(`[shadow] wrote scoring-shadow-report (source=${result.source})`);
  } catch (err) {
    console.error("[shadow] writeDataStore failed:", err?.message ?? err);
    process.exitCode = 1;
  }

  // Always also write the file mirror so the workflow can commit it. The
  // helper writeDataStore only writes to Redis; mirror manually.
  try {
    const fs = await import("node:fs");
    const filePath = resolve(process.cwd(), "data", "scoring-shadow-report.json");
    fs.writeFileSync(filePath, JSON.stringify(outPayload, null, 2), "utf8");
    console.log(`[shadow] mirrored to ${filePath}`);
  } catch (err) {
    console.warn("[shadow] file mirror failed:", err?.message ?? err);
  }

  if (cachedReader && typeof cachedReader.quit === "function") {
    await cachedReader.quit();
  }
  await closeDataStore();
  console.log(
    `[shadow] done — ${reports.length} report(s), ${skipped.length} skipped`,
  );
}

main().catch((err) => {
  console.error("[shadow] fatal:", err);
  process.exit(1);
});
