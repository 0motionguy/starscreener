#!/usr/bin/env node
// Ping MCP servers' manifest endpoints + record uptime + tool count.
//
// MOTIVATION
//   The MCP domain scorer (src/lib/pipeline/scoring/domain/mcp.ts) wants:
//     - livenessUptime7d  (0..1)   uptime over the last 7 days
//     - toolCount         number   how many tools the server exposes
//     - p50LatencyMs      number   median manifest response time
//     - isStdio           boolean  short-circuits the liveness term
//
//   Today the publish payload (apps/trendingrepo-worker → ss:data:v1:trending-mcp)
//   doesn't expose any of these, so the scorer drops the components entirely.
//   This collector fills that gap by pinging each MCP that exposes an HTTP
//   endpoint and persisting a rolling 7d uptime buffer.
//
// ALGORITHM
//   1. Read trending-mcp from Redis (or skip if missing).
//   2. Detect each MCP's transport: HTTP (URL ends in /mcp, /sse, has explicit
//      manifest_url, or url is a non-github.com web endpoint) vs stdio.
//   3. For HTTP servers: POST `tools/list` JSON-RPC, count success if HTTP 200
//      with a parseable body that contains result.tools (array).
//   4. Append the ping to a per-server rolling buffer at `mcp-liveness:<slug>`,
//      pruning to last 7 days.
//   5. Compute aggregate (uptime7d, p50LatencyMs, toolCount) and write the
//      summary to `mcp-liveness` (no slug suffix) for the leaderboard reader.
//   6. Mirror the aggregate to data/mcp-liveness.json so the workflow can
//      commit it (file mirror = audit trail / DR snapshot).
//
// CONCURRENCY
//   Hand-rolled semaphore: at most CONCURRENCY in-flight requests at once.
//   Each ping has a 5s timeout. Per-server backoff: if last 3 pings failed,
//   we still ping (no skipping for MVP) — the failure just rolls into the
//   uptime average. Total HTTP budget for ~2500 MCPs at 50 concurrency with
//   5s timeouts: ~25-30s. Well under the 120s budget.
//
// STDIO HANDLING
//   When no HTTP endpoint detectable: mark isStdio=true, livenessInferred=true,
//   leave uptime7d undefined so the scorer drops the term cleanly.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "mcp-liveness.json");

const CONCURRENCY = 50;
const PING_TIMEOUT_MS = 5_000;
const ROLLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NAMESPACE = "ss:data:v1";
const META_NAMESPACE = "ss:meta:v1";
const USER_AGENT = "TrendingRepo-MCP-Liveness/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[mcp-liveness] ${msg}`);
}

// ---------------------------------------------------------------------------
// Redis client (uses same backend selection as _data-store-write.mjs but we
// also need GET, which writeDataStore() doesn't expose). Lazy-loaded.
// ---------------------------------------------------------------------------

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
    });
    client.on("error", (err) => {
      console.warn(`[mcp-liveness] ioredis transport error: ${err.message}`);
    });
    return {
      kind: "ioredis",
      async get(key) {
        return client.get(key);
      },
      async set(key, value) {
        return client.set(key, value);
      },
      async quit() {
        try {
          await client.quit();
        } catch {
          /* ignore */
        }
      },
    };
  }

  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    const client = new Redis({ url: upstashUrl, token: upstashToken });
    return {
      kind: "upstash",
      async get(key) {
        return client.get(key);
      },
      async set(key, value) {
        return client.set(key, value);
      },
      async quit() {
        /* no-op for REST client */
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Endpoint detection
// ---------------------------------------------------------------------------

/**
 * Try to extract an HTTP MCP endpoint URL from a published item. Returns
 * `null` when no usable HTTP endpoint can be found (treat as stdio).
 *
 * Heuristics (in priority order):
 *   1. raw.manifest_url, raw.endpoint, raw.endpointUrl, raw.url-of-form
 *      ending in /mcp or /sse — direct hit.
 *   2. raw.transport === "http" or "sse" + raw.url present → use raw.url.
 *   3. item.url that is NOT github.com/* and NOT a docs-style page → speculative.
 *      We exclude github.com (source repo, not endpoint) and known docs hosts.
 *   4. Otherwise → null (stdio).
 */
function detectHttpEndpoint(item) {
  const raw = item && typeof item === "object" ? item : {};
  const candidates = [
    raw.manifest_url,
    raw.endpoint,
    raw.endpointUrl,
    raw.endpoint_url,
    raw.mcp_endpoint,
    raw.transport_url,
    raw.serverUrl,
    raw.server_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) {
      return normalizeEndpoint(c);
    }
  }

  const transport = typeof raw.transport === "string" ? raw.transport.toLowerCase() : null;
  if ((transport === "http" || transport === "sse" || transport === "streamable-http") &&
      typeof raw.url === "string" && /^https?:\/\//i.test(raw.url)) {
    return normalizeEndpoint(raw.url);
  }

  // Speculative: url path ends in /mcp or /sse
  const url = typeof raw.url === "string" ? raw.url : null;
  if (url && /^https?:\/\//i.test(url)) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (parsed) {
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      // Exclude obvious source-repo / docs hosts
      const docHosts = new Set([
        "github.com",
        "www.github.com",
        "gitlab.com",
        "bitbucket.org",
        "npmjs.com",
        "www.npmjs.com",
        "pypi.org",
      ]);
      if (!docHosts.has(host) && (path.endsWith("/mcp") || path.endsWith("/sse"))) {
        return normalizeEndpoint(url);
      }
    }
  }

  return null;
}

function normalizeEndpoint(url) {
  try {
    const u = new URL(url);
    return u.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single-server ping
// ---------------------------------------------------------------------------

async function pingOne(endpoint) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        id: "liveness",
        params: {},
      }),
      signal: controller.signal,
    });
    const ms = Date.now() - startedAt;
    if (!res.ok) {
      return { ok: false, ms, toolCount: undefined };
    }
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, ms, toolCount: undefined };
    }
    const tools = body && body.result && Array.isArray(body.result.tools)
      ? body.result.tools
      : null;
    if (!tools) {
      return { ok: false, ms, toolCount: undefined };
    }
    return { ok: true, ms, toolCount: tools.length };
  } catch {
    return { ok: false, ms: Date.now() - startedAt, toolCount: undefined };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Concurrency pool — semaphore over a queue of tasks.
// ---------------------------------------------------------------------------

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= tasks.length) return;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        results[idx] = { error: err };
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Rolling buffer per server
// ---------------------------------------------------------------------------

function pruneOldPings(pings, nowMs) {
  const cutoff = nowMs - ROLLING_WINDOW_MS;
  return pings.filter((p) => Number.isFinite(p?.ts) && p.ts >= cutoff);
}

function computeAggregate(pings) {
  if (pings.length === 0) {
    return { uptime7d: 0, p50LatencyMs: undefined, toolCount: undefined };
  }
  const okCount = pings.reduce((n, p) => (p.ok ? n + 1 : n), 0);
  const uptime7d = okCount / pings.length;

  const successMs = pings.filter((p) => p.ok && Number.isFinite(p.ms)).map((p) => p.ms);
  successMs.sort((a, b) => a - b);
  const p50LatencyMs = successMs.length > 0
    ? successMs[Math.floor(successMs.length / 2)]
    : undefined;

  // Latest tool count from the most recent successful ping.
  const latestOk = [...pings].reverse().find((p) => p.ok && Number.isFinite(p.toolCount));
  const toolCount = latestOk ? latestOk.toolCount : undefined;

  return { uptime7d, p50LatencyMs, toolCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const fetchedAt = new Date().toISOString();
  const nowMs = Date.now();

  const redis = await getRedisClient();
  if (!redis) {
    log("REDIS_URL/UPSTASH not set — cannot read trending-mcp roster. Exiting.");
    process.exit(0);
  }

  // 1. Load roster.
  let payloadRaw;
  try {
    payloadRaw = await redis.get(`${NAMESPACE}:trending-mcp`);
  } catch (err) {
    log(`failed to read trending-mcp: ${err?.message ?? err}`);
    await redis.quit();
    process.exit(1);
  }
  if (!payloadRaw) {
    log("trending-mcp Redis key missing — nothing to ping. Exiting.");
    await redis.quit();
    process.exit(0);
  }
  const parsed = typeof payloadRaw === "string" ? safeJsonParse(payloadRaw) : payloadRaw;
  const items = parsed && Array.isArray(parsed.items) ? parsed.items : [];
  log(`loaded ${items.length} MCPs from roster`);

  // 2. Classify + build ping tasks.
  const summary = {};
  const httpTargets = [];
  for (const item of items) {
    const slug = typeof item.slug === "string" ? item.slug : (typeof item.id === "string" ? item.id : null);
    if (!slug) continue;
    const endpoint = detectHttpEndpoint(item);
    if (!endpoint) {
      summary[slug] = {
        uptime7d: undefined,
        p50LatencyMs: undefined,
        toolCount: undefined,
        isStdio: true,
        livenessInferred: true,
      };
      continue;
    }
    httpTargets.push({ slug, endpoint });
  }
  log(`http endpoints: ${httpTargets.length} | stdio-only: ${items.length - httpTargets.length}`);

  // 3. Ping in pool.
  const tasks = httpTargets.map(({ slug, endpoint }) => async () => {
    const result = await pingOne(endpoint);
    return { slug, endpoint, ...result };
  });
  const startMs = Date.now();
  const pingResults = await runPool(tasks, CONCURRENCY);
  log(`pinged ${pingResults.length} servers in ${Date.now() - startMs}ms`);

  // 4. Update per-server rolling buffer + aggregate.
  let okCount = 0;
  for (const r of pingResults) {
    if (!r || r.error) continue;
    const { slug, ok, ms, toolCount } = r;
    if (ok) okCount += 1;

    // Read existing buffer (best-effort).
    const bufKey = `${NAMESPACE}:mcp-liveness:${slug}`;
    let prevPings = [];
    try {
      const existing = await redis.get(bufKey);
      if (existing) {
        const parsedBuf = typeof existing === "string" ? safeJsonParse(existing) : existing;
        if (parsedBuf && Array.isArray(parsedBuf.pings)) {
          prevPings = parsedBuf.pings;
        }
      }
    } catch {
      /* missing or unparseable — start fresh */
    }

    const newPing = { ts: nowMs, ok, ms, toolCount };
    const merged = pruneOldPings([...prevPings, newPing], nowMs);

    try {
      await redis.set(bufKey, JSON.stringify({ pings: merged, updatedAt: fetchedAt }));
    } catch (err) {
      log(`buffer write failed for ${slug}: ${err?.message ?? err}`);
    }

    const agg = computeAggregate(merged);
    summary[slug] = {
      uptime7d: agg.uptime7d,
      p50LatencyMs: agg.p50LatencyMs,
      toolCount: agg.toolCount,
      isStdio: false,
      livenessInferred: false,
    };
  }
  log(`success rate this run: ${okCount}/${pingResults.length}`);

  // 5. Write aggregate (also lands in data/mcp-liveness.json via the file
  //    mirror that the workflow commits).
  const aggregate = {
    fetchedAt,
    summary,
    counts: {
      total: items.length,
      http: httpTargets.length,
      stdio: items.length - httpTargets.length,
      okThisRun: okCount,
    },
  };

  // Use writeDataStore to land both `mcp-liveness` payload + meta keys
  // consistently with other collectors.
  const result = await writeDataStore("mcp-liveness", aggregate);

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(aggregate, null, 2) + "\n", "utf8");

  log(`wrote ${OUT_PATH} [redis: ${result.source}]`);
  log(`  total=${aggregate.counts.total} http=${aggregate.counts.http} stdio=${aggregate.counts.stdio} ok=${aggregate.counts.okThisRun}`);

  await redis.quit();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  main().catch((err) => {
    console.error("ping-mcp-liveness failed:", err.message ?? err);
    process.exit(1);
  });
}

export { detectHttpEndpoint, computeAggregate, pruneOldPings, runPool };
