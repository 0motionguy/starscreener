#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const OUT_DIR = resolve(ROOT, ".audit");
const OUT_FILE = resolve(
  OUT_DIR,
  "AGN-1521-producthunt-dual-writer-provenance-packet.json",
);

const SLUG = "producthunt-launches";
const FILE = "producthunt-launches.json";
const DATA_NS = "ss:data:v1";
const META_NS = "ss:meta:v1";
const STALE_BUDGET_HOURS = 12;

async function createRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const c = new IORedis(redisUrl, { maxRetriesPerRequest: 3, connectTimeout: 5000 });
    return {
      kind: "ioredis",
      async get(key) {
        return c.get(key);
      },
      async quit() {
        try {
          await c.quit();
        } catch {}
      },
    };
  }

  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    const c = new Redis({ url: upstashUrl, token: upstashToken });
    return {
      kind: "upstash",
      async get(key) {
        return c.get(key);
      },
      async quit() {},
    };
  }

  return null;
}

function parseMeta(raw) {
  if (raw == null) return { raw: null, parsed: null };
  if (typeof raw === "object") return { raw, parsed: raw };
  if (typeof raw !== "string") return { raw, parsed: null };
  if (raw.startsWith("{")) {
    try {
      return { raw, parsed: JSON.parse(raw) };
    } catch {
      return { raw, parsed: null };
    }
  }
  return { raw, parsed: { writtenAt: raw } };
}

function isoOrNull(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function ageHours(iso) {
  if (!iso) return null;
  return Math.round(((Date.now() - Date.parse(iso)) / 36e5) * 100) / 100;
}

function classifyWriter(writer) {
  if (!writer) return "unknown";
  if (writer.startsWith("worker:")) return "worker";
  if (writer.startsWith("github-actions:")) return "github-actions";
  return "other";
}

function classifyStatus(metaAgeHours, payloadAgeHours, fileAgeHours, writerKind) {
  const ages = [metaAgeHours, payloadAgeHours, fileAgeHours].filter((x) => x !== null);
  const maxAge = ages.length > 0 ? Math.max(...ages) : null;
  if (maxAge !== null && maxAge > STALE_BUDGET_HOURS) return "RED";
  if (writerKind === "unknown") return "YELLOW";
  return "GREEN";
}

async function main() {
  const redis = await createRedisClient();
  const filePath = resolve(DATA_DIR, FILE);

  let fileJson = null;
  let fileMtime = null;
  try {
    const [raw, s] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
    fileJson = JSON.parse(raw);
    fileMtime = new Date(s.mtimeMs).toISOString();
  } catch {}

  let metaParsed = null;
  let payloadFetchedAt = null;
  if (redis) {
    const rawMeta = await redis.get(`${META_NS}:${SLUG}`);
    const rawPayload = await redis.get(`${DATA_NS}:${SLUG}`);
    metaParsed = parseMeta(rawMeta).parsed;
    if (rawPayload) {
      const payloadObj = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
      payloadFetchedAt = isoOrNull(payloadObj?.lastFetchedAt ?? payloadObj?.fetchedAt ?? null);
    }
  }

  const writer = metaParsed?.writer ?? null;
  const writerKind = classifyWriter(writer);
  const redisMetaWrittenAt = isoOrNull(metaParsed?.writtenAt ?? null);
  const fileFetchedAt = isoOrNull(fileJson?.lastFetchedAt ?? fileJson?.fetchedAt ?? null);
  const metaAgeHours = ageHours(redisMetaWrittenAt);
  const payloadAgeHours = ageHours(payloadFetchedAt);
  const fileAgeHours = ageHours(fileFetchedAt ?? fileMtime);
  const payloadVsMetaLagHours =
    redisMetaWrittenAt && payloadFetchedAt
      ? Math.round(Math.abs((Date.parse(redisMetaWrittenAt) - Date.parse(payloadFetchedAt)) / 36e5) * 100) / 100
      : null;
  const fileVsMetaLagHours =
    redisMetaWrittenAt && (fileFetchedAt ?? fileMtime)
      ? Math.round(
          Math.abs((Date.parse(redisMetaWrittenAt) - Date.parse(fileFetchedAt ?? fileMtime)) / 36e5) * 100,
        ) / 100
      : null;

  const status = classifyStatus(metaAgeHours, payloadAgeHours, fileAgeHours, writerKind);
  const packet = {
    issue: "AGN-1521",
    generatedAt: new Date().toISOString(),
    staleBudgetHours: STALE_BUDGET_HOURS,
    redisBackend: redis?.kind ?? "missing",
    slug: SLUG,
    writer,
    writerKind,
    status,
    redisMetaWrittenAt,
    redisMetaAgeHours: metaAgeHours,
    redisPayloadFetchedAt: payloadFetchedAt,
    redisPayloadAgeHours: payloadAgeHours,
    filePath: `data/${FILE}`,
    fileFetchedAt,
    fileMtime,
    fileAgeHours,
    payloadVsMetaLagHours,
    fileVsMetaLagHours,
    flags: {
      redisUnavailable: redis === null,
      writerUnresolved: writerKind === "unknown",
      redisPayloadStale: payloadAgeHours !== null && payloadAgeHours > STALE_BUDGET_HOURS,
      fileStale: fileAgeHours !== null && fileAgeHours > STALE_BUDGET_HOURS,
      redisFileDriftOver1h: fileVsMetaLagHours !== null && fileVsMetaLagHours > 1,
    },
  };

  if (redis) await redis.quit();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  process.stdout.write(`${OUT_FILE}\n`);
  process.stdout.write(`${JSON.stringify({ status: packet.status, flags: packet.flags })}\n`);
}

main().catch((err) => {
  console.error("audit-producthunt-dual-writer-drift failed:", err?.message ?? err);
  process.exitCode = 1;
});

