import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpClient } from '../src/lib/http.js';
import { createMockRedis } from './helpers/redis-mock.js';

interface HandlerCtx {
  hits: number;
  etag: string;
  body: string;
}

let server: http.Server;
let baseUrl: string;
const ctx: HandlerCtx = { hits: 0, etag: '"v1"', body: '{"ok":true,"version":1}' };

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/json') {
          ctx.hits++;
          if (req.headers['if-none-match'] === ctx.etag) {
            res.writeHead(304, { etag: ctx.etag });
            res.end();
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json', etag: ctx.etag });
          res.end(ctx.body);
          return;
        }
        if (req.url === '/429-then-200') {
          ctx.hits++;
          if (ctx.hits === 1) {
            res.writeHead(429, { 'retry-after': '0' });
            res.end();
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"recovered":true}');
          return;
        }
        if (req.url === '/500-then-200') {
          ctx.hits++;
          if (ctx.hits === 1) {
            res.writeHead(503);
            res.end();
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"recovered":true}');
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

describe('http client', () => {
  it('caches via ETag and returns cached body on 304', async () => {
    ctx.hits = 0;
    const redis = createMockRedis();
    const client = createHttpClient({ redis });

    const first = await client.json<{ ok: boolean }>(`${baseUrl}/json`);
    expect(first.cached).toBe(false);
    expect(first.data.ok).toBe(true);
    expect(ctx.hits).toBe(1);

    const second = await client.json<{ ok: boolean }>(`${baseUrl}/json`);
    expect(second.cached).toBe(true);
    expect(second.data.ok).toBe(true);
    expect(ctx.hits).toBe(2);
  });

  it('honors 429 Retry-After then succeeds', async () => {
    ctx.hits = 0;
    const redis = createMockRedis();
    const client = createHttpClient({ redis });
    const result = await client.json<{ recovered: boolean }>(`${baseUrl}/429-then-200`);
    expect(result.data.recovered).toBe(true);
    expect(ctx.hits).toBe(2);
  });

  it('retries 5xx with backoff', async () => {
    ctx.hits = 0;
    const redis = createMockRedis();
    const client = createHttpClient({ redis });
    const result = await client.json<{ recovered: boolean }>(`${baseUrl}/500-then-200`);
    expect(result.data.recovered).toBe(true);
    expect(ctx.hits).toBe(2);
  });
});
