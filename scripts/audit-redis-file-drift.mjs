#!/usr/bin/env node
import { readdir, readFile, stat, mkdir, appendFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { keys } from "./_data-store-write.mjs";

const ROOT = process.cwd();
const DATA_DIR = resolve(ROOT, "data");
const OUT_DIR = resolve(ROOT, ".audit");
const OUT_MD = resolve(OUT_DIR, "AGN-345-redis-vs-file-drift-matrix.md");
const OUT_JSONL = resolve(ROOT, ".data", "redis-file-drift-matrix.jsonl");

const SAMPLE_KEYS = [
  "trending",
  "deltas",
  "twitter-trending",
  "devto-trending",
  "devto-mentions",
  "mcp-liveness",
  "mcp-downloads",
  "mcp-dependents",
  "mcp-smithery-rank",
  "collection-rankings",
  "reddit-mentions",
  "hackernews-trending",
];

const KEY_TO_ROUTE = {
  "trending": "/, /breakouts, /top, /predict",
  "deltas": "/, /breakouts, /top",
  "twitter-trending": "/twitter",
  "devto-trending": "/devto",
  "devto-mentions": "/devto, /signals",
  "mcp-liveness": "/mcp",
  "mcp-downloads": "/mcp",
  "mcp-dependents": "/mcp",
  "mcp-smithery-rank": "/mcp",
  "collection-rankings": "/collections",
  "reddit-mentions": "/reddit/trending, /signals",
  "hackernews-trending": "/hackernews/trending, /signals",
};

function parseIso(x) {
  if (!x || typeof x !== "string") return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function hoursAgo(iso) {
  if (!iso) return null;
  return Number(((Date.now() - Date.parse(iso)) / 36e5).toFixed(2));
}

async function createRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const c = new IORedis(redisUrl, { maxRetriesPerRequest: 3, connectTimeout: 5000 });
    return {
      kind: "ioredis",
      async get(k) { return c.get(k); },
      async quit() { try { await c.quit(); } catch {} },
    };
  }

  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    const c = new Redis({ url: upstashUrl, token: upstashToken });
    return {
      kind: "upstash",
      async get(k) { return c.get(k); },
      async quit() {},
    };
  }

  return null;
}

function parseMeta(raw) {
  if (raw == null) return { writtenAt: null, writer: null, runId: null, commit: null };
  if (typeof raw === "string") {
    if (raw.startsWith("{")) {
      try {
        const p = JSON.parse(raw);
        return {
          writtenAt: parseIso(p?.writtenAt ?? null),
          writer: typeof p?.writer === "string" ? p.writer : null,
          runId: typeof p?.runId === "string" ? p.runId : null,
          commit: typeof p?.commit === "string" ? p.commit : null,
        };
      } catch {
        return { writtenAt: parseIso(raw), writer: null, runId: null, commit: null };
      }
    }
    return { writtenAt: parseIso(raw), writer: null, runId: null, commit: null };
  }
  if (typeof raw === "object") {
    return {
      writtenAt: parseIso(raw?.writtenAt ?? null),
      writer: typeof raw?.writer === "string" ? raw.writer : null,
      runId: typeof raw?.runId === "string" ? raw.runId : null,
      commit: typeof raw?.commit === "string" ? raw.commit : null,
    };
  }
  return { writtenAt: null, writer: null, runId: null, commit: null };
}

function classify(redisTs, fileTs) {
  if (redisTs && fileTs) {
    const driftH = Number(((Date.parse(redisTs) - Date.parse(fileTs)) / 36e5).toFixed(2));
    if (Math.abs(driftH) <= 1) return { class: "in_sync", driftHours: driftH, fallbackRisk: "low" };
    if (driftH > 1) return { class: "redis_newer", driftHours: driftH, fallbackRisk: "high" };
    return { class: "file_newer", driftHours: driftH, fallbackRisk: "medium" };
  }
  if (redisTs && !fileTs) return { class: "redis_only", driftHours: null, fallbackRisk: "high" };
  if (!redisTs && fileTs) return { class: "file_only", driftHours: null, fallbackRisk: "high" };
  return { class: "both_missing", driftHours: null, fallbackRisk: "high" };
}

async function fileProbe(slug) {
  const filePath = resolve(DATA_DIR, `${slug}.json`);
  try {
    const [s, raw] = await Promise.all([stat(filePath), readFile(filePath, "utf8")]);
    let fetchedAt = null;
    try {
      const obj = JSON.parse(raw);
      fetchedAt = parseIso(obj?.fetchedAt ?? null);
    } catch {}
    return {
      exists: true,
      file: basename(filePath),
      mtime: new Date(s.mtimeMs).toISOString(),
      fetchedAt,
    };
  } catch {
    return { exists: false, file: `${slug}.json`, mtime: null, fetchedAt: null };
  }
}

async function main() {
  const redis = await createRedisClient();
  const generatedAt = new Date().toISOString();

  const rows = [];
  for (const slug of SAMPLE_KEYS) {
    const fp = await fileProbe(slug);
    let rawMeta = null;
    if (redis) {
      rawMeta = await redis.get(keys.meta(slug));
    }
    const meta = parseMeta(rawMeta);
    const redisTs = meta.writtenAt;
    const fileTs = fp.fetchedAt ?? fp.mtime;
    const c = classify(redisTs, fileTs);

    rows.push({
      key: slug,
      route: KEY_TO_ROUTE[slug] ?? "(unmapped)",
      redisWrittenAt: redisTs,
      redisAgeHours: hoursAgo(redisTs),
      redisWriter: meta.writer,
      file: fp.file,
      fileTimestamp: fileTs,
      fileAgeHours: hoursAgo(fileTs),
      driftHours: c.driftHours,
      driftClass: c.class,
      fallbackRisk: c.fallbackRisk,
    });
  }

  if (redis) await redis.quit();

  const summary = {
    generatedAt,
    redisBackend: redis?.kind ?? "missing",
    total: rows.length,
    redis_newer: rows.filter((r) => r.driftClass === "redis_newer").length,
    file_newer: rows.filter((r) => r.driftClass === "file_newer").length,
    in_sync: rows.filter((r) => r.driftClass === "in_sync").length,
    redis_only: rows.filter((r) => r.driftClass === "redis_only").length,
    file_only: rows.filter((r) => r.driftClass === "file_only").length,
    both_missing: rows.filter((r) => r.driftClass === "both_missing").length,
    high_risk: rows.filter((r) => r.fallbackRisk === "high").map((r) => r.key),
  };

  const prioritizedFixOrder = [
    "1) trending + deltas (largest blast radius for home/breakouts/top/predict)",
    "2) mcp-downloads, mcp-dependents, mcp-smithery-rank (MCP page integrity + null-meta risk)",
    "3) collection-rankings (collections surface)",
    "4) twitter-trending + devto-* (signal terminal freshness)"
  ];

  const md = [
    `# AGN-345 Drift Matrix`,
    ``,
    `Generated: ${generatedAt}`,
    `Redis backend: ${summary.redisBackend}`,
    ``,
    `Summary: total=${summary.total}, redis_newer=${summary.redis_newer}, file_newer=${summary.file_newer}, in_sync=${summary.in_sync}, redis_only=${summary.redis_only}, file_only=${summary.file_only}, both_missing=${summary.both_missing}`,
    ``,
    `| key | route | redisWrittenAt | fileTimestamp | driftHours (redis-file) | class | fallbackRisk |`,
    `|---|---|---|---|---:|---|---|`,
    ...rows.map((r) => `| ${r.key} | ${r.route} | ${r.redisWrittenAt ?? "-"} | ${r.fileTimestamp ?? "-"} | ${r.driftHours ?? "-"} | ${r.driftClass} | ${r.fallbackRisk} |`),
    ``,
    `## Prioritized fix order`,
    ...prioritizedFixOrder.map((x) => `- ${x}`),
    ``,
    `## High-risk keys`,
    ...(summary.high_risk.length ? summary.high_risk.map((k) => `- ${k}`) : ["- none"]),
    ``,
  ].join("\n");

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_MD, md, "utf8");

  const jsonlRecord = {
    issue: "AGN-345",
    generatedAt,
    summary,
    rows,
    prioritizedFixOrder,
  };
  await appendFile(OUT_JSONL, `${JSON.stringify(jsonlRecord)}\n`, "utf8");

  console.log(OUT_MD);
  console.log(OUT_JSONL);
  console.log(JSON.stringify(summary));
}

main().catch((err) => {
  console.error("audit-redis-file-drift failed:", err?.message ?? err);
  process.exitCode = 1;
});
