#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_NS = "ss:data:v1";
const META_NS = "ss:meta:v1";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function parseMetaWrittenAt(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    if (raw.startsWith("{")) {
      try {
        const obj = JSON.parse(raw);
        if (typeof obj.writtenAt === "string") return obj.writtenAt;
      } catch {
        return raw;
      }
    }
    return raw;
  }
  if (typeof raw === "object" && raw && typeof raw.writtenAt === "string") {
    return raw.writtenAt;
  }
  return null;
}

async function makeRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("missing REDIS_URL");
  }
  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(redisUrl, { maxRetriesPerRequest: 3, connectTimeout: 5000 });
  client.on("error", () => {});
  return {
    get: (k) => client.get(k),
    close: async () => {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}

function summarizeJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let parseErrors = 0;
  for (const line of lines) {
    try {
      JSON.parse(line);
    } catch {
      parseErrors += 1;
    }
  }
  return { lines: lines.length, parseErrors };
}

async function main() {
  const client = await makeRedisClient();
  const sources = ["trending", "reddit-all-posts", "hackernews-trending"];
  const rows = [];

  for (const slug of sources) {
    const filePath = path.resolve(process.cwd(), "data", `${slug}.json`);
    const fileValue = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const fileLen = Buffer.byteLength(JSON.stringify(fileValue));
    const fileHash = shortHash(stableStringify(fileValue));
    const fileMtime = fs.statSync(filePath).mtime.toISOString();

    const redisRaw = await client.get(`${DATA_NS}:${slug}`);
    const metaRaw = await client.get(`${META_NS}:${slug}`);
    if (!redisRaw) {
      rows.push({
        source: slug,
        status: "REDIS_MISSING",
        fileLen,
        fileHash,
        fileMtime,
        redisLen: 0,
        redisHash: null,
        redisWrittenAt: parseMetaWrittenAt(metaRaw),
      });
      continue;
    }

    const redisValue = JSON.parse(redisRaw);
    const redisLen = Buffer.byteLength(JSON.stringify(redisValue));
    const redisHash = shortHash(stableStringify(redisValue));
    rows.push({
      source: slug,
      status: fileHash === redisHash ? "MATCH" : "DRIFT",
      fileLen,
      fileHash,
      fileMtime,
      redisLen,
      redisHash,
      redisWrittenAt: parseMetaWrittenAt(metaRaw),
    });
  }

  const jsonlChecks = [
    ".data/twitter-repo-signals.jsonl",
    ".data/twitter-scans.jsonl",
    ".data/mentions.jsonl",
  ].map((rel) => {
    const full = path.resolve(process.cwd(), rel);
    const summary = summarizeJsonl(full);
    return { file: rel, ...summary };
  });

  console.log(JSON.stringify({ sources: rows, jsonlChecks }, null, 2));
  await client.close();
}

main().catch((err) => {
  console.error(`probe-dual-write-integrity failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
