import http from 'node:http';
import { loadEnv } from './lib/env.js';
import { getDb, pingDb } from './lib/db.js';
import { getRedis } from './lib/redis.js';
import { getLogger } from './lib/log.js';

interface HealthState {
  ok: boolean;
  db: boolean;
  redis: boolean;
  lastCheckAt: string;
  lastRunAt: string | null;
}

let cached: HealthState | null = null;
let inFlight: Promise<HealthState> | null = null;
const TTL_MS = 30_000;

export function recordRun(at: Date = new Date()): void {
  if (cached) cached.lastRunAt = at.toISOString();
}

async function refreshHealth(): Promise<HealthState> {
  const log = getLogger();
  let dbOk = false;
  let redisOk = false;
  try {
    dbOk = await pingDb(getDb());
  } catch (err) {
    log.warn(`healthcheck db: ${(err as Error).message}`);
  }
  try {
    const handle = await getRedis();
    if (handle) {
      await handle.set('tr:healthcheck', new Date().toISOString(), { ex: 60 });
      redisOk = true;
    } else {
      redisOk = true; // disabled-by-config counts as healthy
    }
  } catch (err) {
    log.warn(`healthcheck redis: ${(err as Error).message}`);
  }
  const state: HealthState = {
    ok: dbOk && redisOk,
    db: dbOk,
    redis: redisOk,
    lastCheckAt: new Date().toISOString(),
    lastRunAt: cached?.lastRunAt ?? null,
  };
  cached = state;
  return state;
}

async function getHealth(): Promise<HealthState> {
  if (cached && Date.now() - Date.parse(cached.lastCheckAt) < TTL_MS) {
    return cached;
  }
  if (inFlight) return inFlight;
  inFlight = refreshHealth().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function startHealthServer(port = loadEnv().PORT): http.Server {
  const log = getLogger();
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      void getHealth().then((state) => {
        res.writeHead(state.ok ? 200 : 503, { 'content-type': 'application/json' });
        res.end(JSON.stringify(state));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => {
    log.info({ port }, 'healthcheck listening');
  });
  return server;
}

export async function oneShotHealthcheck(): Promise<number> {
  const state = await refreshHealth();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(state, null, 2));
  return state.ok ? 0 : 1;
}
