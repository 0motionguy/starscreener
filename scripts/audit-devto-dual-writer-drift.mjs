#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const OUT_DIR = resolve(ROOT, ".audit");
const OUT_FILE = resolve(OUT_DIR, "AGN-210-devto-dual-writer-drift-packet.json");

const KEYS = [
  { slug: "devto-mentions", file: "devto-mentions.json" },
  { slug: "devto-trending", file: "devto-trending.json" },
];

const DATA_NS = "ss:data:v1";
const META_NS = "ss:meta:v1";

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

async function readJsonFile(path) {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isoOrNull(value) {
  if (typeof value !== "string" || !value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function ageHours(iso) {
  if (!iso) return null;
  return Math.round(((Date.now() - Date.parse(iso)) / 36e5) * 100) / 100;
}

async function fileMtimeIso(path) {
  try {
    const s = await stat(path);
    return new Date(s.mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function classifyWriter(writer) {
  if (!writer) return "unknown";
  if (writer.startsWith("worker:")) return "worker";
  if (writer.startsWith("github-actions:")) return "github-actions";
  return "other";
}

async function main() {
  const redis = await createRedisClient();
  const packet = {
    issue: "AGN-210",
    generatedAt: new Date().toISOString(),
    redisBackend: redis?.kind ?? "missing",
    keys: [],
    summary: {
      unresolvedWriter: 0,
      writerDisagreement: 0,
      payloadLagOver1h: 0,
      fileLagOver1h: 0,
    },
  };

  for (const entry of KEYS) {
    const filePath = resolve(DATA_DIR, entry.file);
    const fileJson = await readJsonFile(filePath);
    const fileFetchedAt = isoOrNull(fileJson?.fetchedAt);
    const fileMtime = await fileMtimeIso(filePath);

    let metaParsed = null;
    let payloadFetchedAt = null;
    if (redis) {
      const rawMeta = await redis.get(`${META_NS}:${entry.slug}`);
      const rawPayload = await redis.get(`${DATA_NS}:${entry.slug}`);
      const meta = parseMeta(rawMeta);
      metaParsed = meta.parsed;
      if (rawPayload) {
        const payloadObj =
          typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
        payloadFetchedAt = isoOrNull(payloadObj?.fetchedAt);
      }
    }

    const writer = metaParsed?.writer ?? null;
    const metaWrittenAt = isoOrNull(metaParsed?.writtenAt ?? null);
    const writerKind = classifyWriter(writer);
    const payloadLagHours =
      metaWrittenAt && payloadFetchedAt
        ? Math.round(Math.abs((Date.parse(metaWrittenAt) - Date.parse(payloadFetchedAt)) / 36e5) * 100) / 100
        : null;
    const fileLagHours =
      metaWrittenAt && fileFetchedAt
        ? Math.round(Math.abs((Date.parse(metaWrittenAt) - Date.parse(fileFetchedAt)) / 36e5) * 100) / 100
        : null;

    if (!writerKind || writerKind === "unknown") packet.summary.unresolvedWriter += 1;
    if (payloadLagHours !== null && payloadLagHours > 1) packet.summary.payloadLagOver1h += 1;
    if (fileLagHours !== null && fileLagHours > 1) packet.summary.fileLagOver1h += 1;
    if (metaWrittenAt && payloadFetchedAt && metaWrittenAt !== payloadFetchedAt) {
      packet.summary.writerDisagreement += 1;
    }

    packet.keys.push({
      slug: entry.slug,
      writer,
      writerKind,
      redisMetaWrittenAt: metaWrittenAt,
      redisMetaAgeHours: ageHours(metaWrittenAt),
      redisPayloadFetchedAt: payloadFetchedAt,
      fileFetchedAt,
      fileMtime,
      payloadLagHours,
      fileLagHours,
    });
  }

  if (redis) await redis.quit();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  process.stdout.write(`${OUT_FILE}\n`);
  process.stdout.write(`${JSON.stringify(packet.summary)}\n`);
}

main().catch((err) => {
  console.error("audit-devto-dual-writer-drift failed:", err?.message ?? err);
  process.exitCode = 1;
});

