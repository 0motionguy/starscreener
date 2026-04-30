// Stream-only Redis helper for the main app.
//
// The data-store at src/lib/data-store.ts is intentionally narrow (k/v only).
// The LLM telemetry layer needs xadd/xrange/xtrim/xlen, so we build a thin
// adapter here that mirrors the same backend selection rules:
//   - REDIS_URL with redis:// or rediss:// → ioredis (Railway)
//   - URL starting https:// + UPSTASH_REDIS_REST_TOKEN → Upstash REST
//
// Keys are owned by this module; no overlap with data-store payload keys.
// All methods return null/empty on Redis miss so the aggregator route can
// degrade gracefully without throwing.

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

export interface StreamHandle {
  xadd(
    key: string,
    fields: Record<string, string>,
    opts?: { maxlenApprox?: number },
  ): Promise<string>;
  xrange(key: string, start: string, end: string, count?: number): Promise<StreamEntry[]>;
  xtrim(key: string, opts: { minIdApprox: string }): Promise<number>;
  xlen(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

let cached: StreamHandle | null | undefined;

export async function getStreamHandle(): Promise<StreamHandle | null> {
  if (cached !== undefined) return cached;

  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://'))) {
    cached = await buildIoredis(redisUrl);
    return cached;
  }
  if (upstashUrl && upstashToken && upstashUrl.startsWith('https://')) {
    cached = await buildUpstash(upstashUrl, upstashToken);
    return cached;
  }
  cached = null;
  return null;
}

async function buildIoredis(url: string): Promise<StreamHandle> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ioredisMod = require('ioredis') as
    | { default: typeof import('ioredis').default }
    | typeof import('ioredis').default;
  const IORedisCtor = 'default' in ioredisMod ? ioredisMod.default : ioredisMod;
  const client = new IORedisCtor(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
  });
  client.on('error', (err: Error) => {
    console.warn('[llm-streams] ioredis error:', err.message);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  return {
    async xadd(key, fields, opts) {
      const args: (string | number)[] = [];
      for (const [k, v] of Object.entries(fields)) args.push(k, v);
      const id = opts?.maxlenApprox && opts.maxlenApprox > 0
        ? await c.xadd(key, 'MAXLEN', '~', opts.maxlenApprox, '*', ...args)
        : await c.xadd(key, '*', ...args);
      return (id as string) ?? '';
    },
    async xrange(key, start, end, count) {
      const raw = (count && count > 0
        ? await c.xrange(key, start, end, 'COUNT', count)
        : await c.xrange(key, start, end)) as Array<[string, string[]]>;
      return raw.map(([id, flat]) => ({ id, fields: pairsToObject(flat) }));
    },
    async xtrim(key, opts) {
      return c.xtrim(key, 'MINID', '~', opts.minIdApprox) as Promise<number>;
    },
    async xlen(key) {
      return c.xlen(key) as Promise<number>;
    },
    async get(key) {
      return client.get(key);
    },
    async set(key, value) {
      await client.set(key, value);
    },
  };
}

interface UpstashStreamLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  xadd(
    key: string,
    id: '*' | string,
    entries: Record<string, unknown>,
    opts?: {
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

async function buildUpstash(url: string, token: string): Promise<StreamHandle> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@upstash/redis') as {
    Redis: new (cfg: { url: string; token: string }) => UpstashStreamLike;
  };
  const client = new mod.Redis({ url, token });
  return {
    async xadd(key, fields, opts) {
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
      const out: StreamEntry[] = [];
      for (const [id, fieldRec] of Object.entries(raw)) {
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldRec ?? {})) fields[k] = String(v);
        out.push({ id, fields });
      }
      out.sort((a, b) => compareStreamIds(a.id, b.id));
      return out;
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
    async get(key) {
      return client.get(key);
    },
    async set(key, value) {
      await client.set(key, value);
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

function compareStreamIds(a: string, b: string): number {
  const [aMs, aSeq] = a.split('-').map((s) => Number.parseInt(s, 10));
  const [bMs, bSeq] = b.split('-').map((s) => Number.parseInt(s, 10));
  if ((aMs ?? 0) !== (bMs ?? 0)) return (aMs ?? 0) - (bMs ?? 0);
  return (aSeq ?? 0) - (bSeq ?? 0);
}

/** Test helper — clear cached client. */
export function _resetStreamHandleForTests(): void {
  cached = undefined;
}
