// SOURCE OF TRUTH for the data-store namespace: ../../scripts/_data-store-write.mjs
// (relative to monorepo root). This file mirrors that contract in TypeScript so
// the worker package is self-contained. Namespace must stay in lockstep.

import type { Redis as IORedisType } from 'ioredis';
import type { RedisHandle, RedisStreamEntry } from './types.js';
import { loadEnv } from './env.js';

const NAMESPACE = 'ss:data:v1';
const META_NAMESPACE = 'ss:meta:v1';

let cachedHandle: RedisHandle | null = null;
let warned = false;

// Module-scoped fetcher name set by run.ts so writeDataStore() can attribute
// last-write provenance without every fetcher having to thread it through.
// The worker scheduler runs one fetcher at a time per `runFetcher()` call,
// so this single-slot mutation is safe.
let currentFetcherName: string | null = null;
export function setCurrentFetcherName(name: string | null): void {
  currentFetcherName = name;
}

export interface DataStoreWriteResult {
  source: 'redis' | 'skipped';
  writtenAt: string;
}

export async function getRedis(): Promise<RedisHandle | null> {
  if (cachedHandle !== null) return cachedHandle;

  const env = loadEnv();
  if (env.DATA_STORE_DISABLE === '1' || env.DATA_STORE_DISABLE === 'true') {
    return null;
  }

  if (env.REDIS_URL) {
    const { Redis: IORedisCtor } = await import('ioredis');
    const client: IORedisType = new IORedisCtor(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
    });
    client.on('error', (err: Error) => {
      console.warn(`[redis] ioredis error: ${err.message}`);
    });
    cachedHandle = ioredisAdapter(client);
    return cachedHandle;
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    const upstash = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    cachedHandle = upstashAdapter(upstash);
    return cachedHandle;
  }

  if (!warned) {
    warned = true;
    console.warn('[redis] no REDIS_URL or UPSTASH_REDIS_REST_URL/TOKEN set - skipping writes');
  }
  return null;
}

function ioredisAdapter(client: IORedisType): RedisHandle {
  return {
    async get(key) {
      return client.get(key);
    },
    async set(key, value, opts) {
      if (opts?.ex && opts.ex > 0) {
        await client.set(key, value, 'EX', opts.ex);
      } else {
        await client.set(key, value);
      }
    },
    async del(key) {
      await client.del(key);
    },
    async quit() {
      try {
        await client.quit();
      } catch {
        /* ignore */
      }
    },
    async xadd(key, fields, opts) {
      const fieldArgs: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        fieldArgs.push(k, v);
      }
      // ioredis xadd: xadd(key [, MAXLEN, ~, n], '*', field, value, ...)
      // Variadic typing in ioredis is loose; cast through unknown.
      const c = client as unknown as {
        xadd: (...args: (string | number)[]) => Promise<string | null>;
      };
      const id = opts?.maxlenApprox && opts.maxlenApprox > 0
        ? await c.xadd(key, 'MAXLEN', '~', opts.maxlenApprox, '*', ...fieldArgs)
        : await c.xadd(key, '*', ...fieldArgs);
      return id ?? '';
    },
    async xrange(key, start, end, count) {
      const c = client as unknown as {
        xrange: (...args: (string | number)[]) => Promise<Array<[string, string[]]>>;
      };
      const raw = count && count > 0
        ? await c.xrange(key, start, end, 'COUNT', count)
        : await c.xrange(key, start, end);
      return raw.map(([id, flat]) => ({ id, fields: pairsToObject(flat) }));
    },
    async xtrim(key, opts) {
      const c = client as unknown as {
        xtrim: (...args: (string | number)[]) => Promise<number>;
      };
      return c.xtrim(key, 'MINID', '~', opts.minIdApprox);
    },
    async xlen(key) {
      const c = client as unknown as { xlen: (k: string) => Promise<number> };
      return c.xlen(key);
    },
  };
}

function pairsToObject(flat: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const k = flat[i];
    const v = flat[i + 1];
    if (k !== undefined && v !== undefined) out[k] = v;
  }
  return out;
}

interface UpstashLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  xadd(
    key: string,
    id: '*' | string,
    entries: Record<string, unknown>,
    opts?: {
      nomkStream?: boolean;
      trim?: { type: 'MAXLEN'; threshold: number; comparison: '~' | '=' };
    },
  ): Promise<string>;
  xrange(
    key: string,
    start: string,
    end: string,
    count?: number,
  ): Promise<Record<string, Record<string, unknown>>>;
  xtrim(
    key: string,
    options: { strategy: 'MAXLEN' | 'MINID'; exactness?: '~' | '='; threshold: number | string },
  ): Promise<number>;
  xlen(key: string): Promise<number>;
}

function upstashAdapter(client: UpstashLike): RedisHandle {
  return {
    async get(key) {
      return client.get(key);
    },
    async set(key, value, opts) {
      if (opts?.ex && opts.ex > 0) {
        await client.set(key, value, { ex: opts.ex });
      } else {
        await client.set(key, value);
      }
    },
    async del(key) {
      await client.del(key);
    },
    async quit() {
      // No-op for Upstash REST.
    },
    async xadd(key, fields, opts) {
      // Stringify all field values — XADD only accepts string/numeric pairs
      // semantically, and we want the wire format to be deterministic.
      const entries: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) entries[k] = String(v);
      const trim =
        opts?.maxlenApprox && opts.maxlenApprox > 0
          ? { type: 'MAXLEN' as const, threshold: opts.maxlenApprox, comparison: '~' as const }
          : undefined;
      return client.xadd(key, '*', entries, trim ? { trim } : undefined);
    },
    async xrange(key, start, end, count) {
      const raw = await client.xrange(key, start, end, count);
      const entries: RedisStreamEntry[] = [];
      for (const [id, fieldRec] of Object.entries(raw)) {
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldRec ?? {})) fields[k] = String(v);
        entries.push({ id, fields });
      }
      // Upstash returns id→fields object; preserve numeric stream-id ordering.
      entries.sort((a, b) => compareStreamIds(a.id, b.id));
      return entries;
    },
    async xtrim(key, opts) {
      return client.xtrim(key, {
        strategy: 'MINID',
        exactness: '~',
        threshold: opts.minIdApprox,
      });
    },
    async xlen(key) {
      return client.xlen(key);
    },
  };
}

// Stream IDs sort lexicographically only if you split on '-' and compare the
// two integer parts. The lex order is wrong on, e.g. '10-0' vs '9-0'.
function compareStreamIds(a: string, b: string): number {
  const [aMs, aSeq] = a.split('-').map((s) => Number.parseInt(s, 10));
  const [bMs, bSeq] = b.split('-').map((s) => Number.parseInt(s, 10));
  if ((aMs ?? 0) !== (bMs ?? 0)) return (aMs ?? 0) - (bMs ?? 0);
  return (aSeq ?? 0) - (bSeq ?? 0);
}

export async function writeDataStore(
  key: string,
  value: unknown,
  opts: DataStoreWriteOptions = {},
): Promise<DataStoreWriteResult> {
  // AUDIT-2026-05-04 §B2 — write WriterMeta envelope so dual-writer
  // observability can show "worker won the last write to <key>" vs
  // "GHA won". Back-compat: parseWriterMeta in src/lib/data-store.ts
  // accepts both envelopes and bare ISO strings.
  const writerMeta = buildWorkerWriterMeta(opts);
  const writtenAt = writerMeta.ts;
  const handle = await getRedis();
  if (!handle) {
    return { source: 'skipped', writtenAt };
  }
  const payload = JSON.stringify(value);
  const metaPayload = JSON.stringify(writerMeta);
  const setOpts = opts.ttlSeconds && opts.ttlSeconds > 0 ? { ex: opts.ttlSeconds } : undefined;

  // Resolve writer: caller wins; otherwise pull from the run.ts-set
  // current-fetcher slot (also handles the `worker:` prefix). JSON-object
  // meta only when at least one provenance field is present; otherwise stay
  // on the bare-ISO-string back-compat shape.
  const writer =
    opts.writer ?? (currentFetcherName ? `worker:${currentFetcherName}` : undefined);
  const hasProvenance =
    writer !== undefined || opts.runId !== undefined || opts.commit !== undefined;
  const metaValue = hasProvenance
    ? JSON.stringify({
        writtenAt,
        ...(writer !== undefined ? { writer } : {}),
        ...(opts.runId !== undefined ? { runId: opts.runId } : {}),
        ...(opts.commit !== undefined ? { commit: opts.commit } : {}),
      })
    : writtenAt;

  await Promise.all([
    handle.set(`${NAMESPACE}:${key}`, payload, setOpts),
    handle.set(`${META_NAMESPACE}:${key}`, metaValue, setOpts),
  ]);
  return { source: 'redis', writtenAt };
}

/**
 * WriterMeta envelope — mirrors src/lib/data-store.ts WriterMeta. Worker
 * writerId defaults to "worker:<service>:<fetcher>" using FETCHER_NAME (set
 * by run.ts before invoking each fetcher) or RAILWAY_SERVICE_NAME.
 */
interface WorkerWriterMeta {
  ts: string;
  writerId?: string;
  sourceWorkflow?: string;
  commitSha?: string;
  runId?: string;
}

function buildWorkerWriterMeta(opts: DataStoreWriteOptions = {}): WorkerWriterMeta {
  const meta: WorkerWriterMeta = { ts: new Date().toISOString() };
  const explicit = opts.writer?.trim() ?? process.env.WRITER_ID?.trim();
  if (explicit) {
    meta.writerId = explicit;
  } else {
    const service = process.env.RAILWAY_SERVICE_NAME?.trim() ?? 'trendingrepo-worker';
    const fetcher = currentFetcherName?.trim() ?? process.env.FETCHER_NAME?.trim();
    meta.writerId = fetcher ? `worker:${service}:${fetcher}` : `worker:${service}`;
  }
  const sha =
    opts.commit?.trim() ??
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ??
    process.env.GITHUB_SHA?.trim();
  if (sha) meta.commitSha = sha;
  const runId = opts.runId?.trim() ?? process.env.GITHUB_RUN_ID?.trim();
  if (runId) meta.runId = runId;
  return meta;
}

/**
 * Read a payload previously written to the data-store by writeDataStore (or
 * scripts/_data-store-write.mjs). Returns null if Redis is disabled, the key
 * is missing, or the stored value isn't valid JSON. Caller is responsible for
 * downcasting to the expected shape — there's no schema validation here.
 *
 * Used by derived fetchers (revenue-benchmarks, reddit-baselines, etc) that
 * compute on top of payloads other fetchers wrote.
 */
export async function readDataStore<T = unknown>(key: string): Promise<T | null> {
  const handle = await getRedis();
  if (!handle) return null;
  const raw = await handle.get(`${NAMESPACE}:${key}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (cachedHandle) {
    await cachedHandle.quit();
    cachedHandle = null;
  }
}
