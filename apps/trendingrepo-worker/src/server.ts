import http from 'node:http';
import { loadEnv } from './lib/env.js';
import { pingDb } from './lib/db.js';
import { getRedis } from './lib/redis.js';
import { getLogger } from './lib/log.js';
import { FETCHERS, SOURCE_CONTRACTS } from './registry.js';
import { findGhostOverrides, getCachedOverrides } from './platform/overrides.js';

interface HealthState {
  ok: boolean;
  db: boolean;
  redis: boolean;
  scheduler: boolean;
  lastCheckAt: string;
  lastRunAt: string | null;
  schedulerIdleSec: number | null;
  /**
   * Override source_ids that no longer correspond to any registered fetcher
   * AND no longer correspond to a static contract row. Empty in the green
   * state. Reaper job (Move 1 step 4) consumes this to archive stale rows.
   */
  ghost_overrides: string[];
}

let cached: HealthState | null = null;
let cachedEnforcesScheduler = false;
let inFlight: Promise<HealthState> | null = null;
const TTL_MS = 30_000;
const PROCESS_STARTED_AT_MS = Date.now();
let lastRunAtMs: number | null = null;

function envNumber(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function recordRun(at: Date = new Date()): void {
  lastRunAtMs = at.getTime();
  if (cached) {
    cached.lastRunAt = at.toISOString();
    cached.schedulerIdleSec = 0;
  }
}

function schedulerHealth(enforceScheduler: boolean): {
  ok: boolean;
  idleSec: number | null;
} {
  const forceScheduler = process.env.WORKER_HEALTH_FORCE_SCHEDULER === '1';
  if (
    !enforceScheduler ||
    (process.env.NODE_ENV !== 'production' && !forceScheduler)
  ) {
    return { ok: true, idleSec: null };
  }

  const nowMs = Date.now();
  const startupGraceMs = envNumber(
    'WORKER_HEALTH_STARTUP_GRACE_MS',
    10 * 60 * 1000,
  );
  if (nowMs - PROCESS_STARTED_AT_MS < startupGraceMs) {
    return { ok: true, idleSec: null };
  }

  if (lastRunAtMs === null) {
    return { ok: false, idleSec: null };
  }

  const idleMs = Math.max(0, nowMs - lastRunAtMs);
  const maxIdleMs = envNumber('WORKER_HEALTH_MAX_IDLE_MS', 15 * 60 * 1000);
  return {
    ok: idleMs <= maxIdleMs,
    idleSec: Math.floor(idleMs / 1000),
  };
}

async function refreshHealth(enforceScheduler = false): Promise<HealthState> {
  const log = getLogger();
  const env = loadEnv();
  let dbOk = false;
  let redisOk = false;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    dbOk = true;
  } else {
    try {
      dbOk = await pingDb();
    } catch (err) {
      log.warn(`healthcheck db: ${(err as Error).message}`);
    }
  }
  try {
    const handle = await getRedis();
    if (handle) {
      await handle.set('tr:healthcheck', new Date().toISOString(), { ex: 60 });
      redisOk = true;
    } else {
      redisOk = env.NODE_ENV !== 'production';
    }
  } catch (err) {
    log.warn(`healthcheck redis: ${(err as Error).message}`);
  }
  const scheduler = schedulerHealth(enforceScheduler);
  const ghostOverrides = findGhostOverrides(FETCHERS, getCachedOverrides(), SOURCE_CONTRACTS);
  const state: HealthState = {
    ok: dbOk && redisOk && scheduler.ok,
    db: dbOk,
    redis: redisOk,
    scheduler: scheduler.ok,
    lastCheckAt: new Date().toISOString(),
    lastRunAt: lastRunAtMs === null ? null : new Date(lastRunAtMs).toISOString(),
    schedulerIdleSec: scheduler.idleSec,
    ghost_overrides: ghostOverrides,
  };
  cached = state;
  cachedEnforcesScheduler = enforceScheduler;
  return state;
}

async function getHealth(enforceScheduler = true): Promise<HealthState> {
  if (
    cached &&
    cachedEnforcesScheduler === enforceScheduler &&
    Date.now() - Date.parse(cached.lastCheckAt) < TTL_MS
  ) {
    return cached;
  }
  if (inFlight) return inFlight;
  inFlight = refreshHealth(enforceScheduler).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function startHealthServer(port = loadEnv().PORT): http.Server {
  const log = getLogger();
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      void getHealth(true).then((state) => {
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

export async function oneShotHealthcheck(
  opts: { enforceScheduler?: boolean } = {},
): Promise<number> {
  const state = await refreshHealth(opts.enforceScheduler === true);
  console.log(JSON.stringify(state, null, 2));
  return state.ok ? 0 : 1;
}
