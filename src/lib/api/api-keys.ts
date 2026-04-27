// User API keys.
//
// Keys are generated once, stored only as SHA-256 hashes, and accepted by
// verifyUserAuth via `x-api-key` or `Authorization: Bearer <key>`.

import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

import {
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const API_KEYS_FILE = "api-keys.jsonl";

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyPublicRecord {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ApiKeyCache {
  path: string;
  mtimeMs: number;
  size: number;
  records: ApiKeyRecord[];
}

let cache: ApiKeyCache | null = null;

function apiKeysPath(): string {
  // Keep verification sync-friendly: file-persistence resolves the data dir,
  // but exposing its path helper would add API surface. This filename is read
  // through readJsonlFile/mutateJsonlFile for writes and via cwd data dir for
  // sync auth reads.
  const dir = process.env.STARSCREENER_DATA_DIR?.trim() || ".data";
  return `${dir.replace(/[\\\/]+$/, "")}/${API_KEYS_FILE}`;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function publicRecord(record: ApiKeyRecord): ApiKeyPublicRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    prefix: record.prefix,
    last4: record.last4,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

function validRecord(row: unknown): row is ApiKeyRecord {
  if (!row || typeof row !== "object") return false;
  const r = row as Partial<ApiKeyRecord>;
  return (
    typeof r.id === "string" &&
    typeof r.userId === "string" &&
    typeof r.name === "string" &&
    typeof r.tokenHash === "string" &&
    typeof r.prefix === "string" &&
    typeof r.last4 === "string" &&
    typeof r.createdAt === "string" &&
    (typeof r.lastUsedAt === "string" || r.lastUsedAt === null) &&
    (typeof r.revokedAt === "string" || r.revokedAt === null)
  );
}

function readRecordsSync(): ApiKeyRecord[] {
  const path = apiKeysPath();
  let stat: { mtimeMs: number; size: number };
  try {
    stat = statSync(path);
  } catch {
    cache = { path, mtimeMs: -1, size: -1, records: [] };
    return [];
  }

  if (
    cache &&
    cache.path === path &&
    cache.mtimeMs === stat.mtimeMs &&
    cache.size === stat.size
  ) {
    return cache.records;
  }

  const raw = readFileSync(path, "utf8");
  const records: ApiKeyRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (validRecord(parsed)) records.push(parsed);
    } catch {
      // Ignore malformed rows during auth. Listing endpoints use the async
      // reader, which follows the repo's broader JSONL behavior.
    }
  }
  cache = { path, mtimeMs: stat.mtimeMs, size: stat.size, records };
  return records;
}

function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") return "Default key";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Default key";
  return trimmed.slice(0, 80);
}

function generateToken(): string {
  return `sskey_${randomBytes(24).toString("base64url")}`;
}

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ token: string; record: ApiKeyPublicRecord }> {
  if (!userId || typeof userId !== "string") {
    throw new Error("createApiKey: userId must be a non-empty string");
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const fullRecord: ApiKeyRecord = {
    id: `ak_${randomBytes(10).toString("base64url")}`,
    userId,
    name: normalizeName(name),
    tokenHash: tokenHash(token),
    prefix: token.slice(0, 12),
    last4: token.slice(-4),
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };

  await mutateJsonlFile<ApiKeyRecord>(API_KEYS_FILE, (current) => [
    ...current.filter(validRecord),
    fullRecord,
  ]);
  cache = null;
  return { token, record: publicRecord(fullRecord) };
}

export async function listApiKeys(userId: string): Promise<ApiKeyPublicRecord[]> {
  const rows = await readJsonlFile<ApiKeyRecord>(API_KEYS_FILE);
  return rows
    .filter(validRecord)
    .filter((row) => row.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(publicRecord);
}

export async function revokeApiKey(
  userId: string,
  keyId: string,
): Promise<ApiKeyPublicRecord | null> {
  if (!keyId || typeof keyId !== "string") return null;
  const now = new Date().toISOString();
  let out: ApiKeyRecord | null = null;

  await mutateJsonlFile<ApiKeyRecord>(API_KEYS_FILE, (current) =>
    current.filter(validRecord).map((row) => {
      if (row.userId !== userId || row.id !== keyId) return row;
      out = { ...row, revokedAt: row.revokedAt ?? now };
      return out;
    }),
  );

  cache = null;
  return out ? publicRecord(out) : null;
}

export function verifyApiKeyTokenSync(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed.startsWith("sskey_")) return null;
  const hash = tokenHash(trimmed);
  const rows = readRecordsSync();
  for (const row of rows) {
    if (row.revokedAt !== null) continue;
    if (timingSafeEqualHex(row.tokenHash, hash)) return row.userId;
  }
  return null;
}

export function __resetApiKeyCacheForTests(): void {
  cache = null;
}
