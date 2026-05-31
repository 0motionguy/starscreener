#!/usr/bin/env node
// Live production health gate for HOSTUP/Cloudflare deployments.
//
// This replaces the old GitHub-side data/_meta freshness gates for scheduled
// monitoring. Production truth now lives in Redis/worker health on HOSTUP, so
// failing a workflow because committed JSON snapshots are stale is noise.

const BASE_URL = (
  process.env.TRENDINGREPO_URL ||
  process.env.STARSCREENER_URL ||
  "https://trendingrepo.com"
).replace(/\/+$/, "");

async function fetchJson(path, okStatuses = [200]) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { parseError: true, raw: text.slice(0, 500) };
  }
  return {
    url,
    status: res.status,
    okStatus: okStatuses.includes(res.status),
    body,
  };
}

function fail(message, context = {}) {
  console.error(`FAIL: ${message}`);
  if (Object.keys(context).length > 0) {
    console.error(JSON.stringify(context, null, 2));
  }
  process.exitCode = 1;
}

function summarizeWorker(body) {
  const summary = body?.summary ?? {};
  const blocking = Array.isArray(body?.slugs)
    ? body.slugs.filter(
        (s) => s?.blocking === true && (s.status === "red" || s.status === "missing"),
      )
    : [];
  const advisory = Array.isArray(body?.slugs)
    ? body.slugs.filter(
        (s) => s?.blocking === false && (s.status === "red" || s.status === "missing"),
      )
    : [];
  return {
    ok: body?.ok,
    summary,
    blockingProblems: blocking.map((s) => ({
      slug: s.slug,
      fetcher: s.fetcher,
      status: s.status,
      ageSec: s.ageSec,
      writtenAt: s.writtenAt,
    })),
    advisoryRedCount: advisory.length,
    advisoryRedSlugs: advisory.map((s) => s.slug).sort(),
  };
}

async function main() {
  console.log(`# Live production health - ${new Date().toISOString()}`);
  console.log(`base=${BASE_URL}`);

  const [appHealth, workerHealth, sourceHealth] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson("/api/worker/health"),
    fetchJson("/api/health/sources", [200, 207]),
  ]);

  console.log("\n/api/health");
  console.log(
    JSON.stringify(
      {
        http: appHealth.status,
        status: appHealth.body?.status,
        sourceStatus: appHealth.body?.sourceStatus,
        lastFetchedAt: appHealth.body?.lastFetchedAt,
        computedAt: appHealth.body?.computedAt,
        warning: appHealth.body?.warning ?? null,
        error: appHealth.body?.error ?? null,
      },
      null,
      2,
    ),
  );

  console.log("\n/api/worker/health");
  const workerSummary = summarizeWorker(workerHealth.body);
  console.log(JSON.stringify({ http: workerHealth.status, ...workerSummary }, null, 2));

  console.log("\n/api/health/sources");
  console.log(
    JSON.stringify(
      {
        http: sourceHealth.status,
        summary: sourceHealth.body?.summary,
      },
      null,
      2,
    ),
  );

  if (!appHealth.okStatus) {
    fail("/api/health returned non-200", {
      http: appHealth.status,
      body: appHealth.body,
    });
  }
  if (appHealth.body?.status !== "ok" || appHealth.body?.error) {
    fail("/api/health is not fresh", appHealth.body);
  }

  if (!workerHealth.okStatus || workerHealth.body?.ok !== true) {
    fail("/api/worker/health is not ok", {
      http: workerHealth.status,
      ...workerSummary,
    });
  }

  const sourceSummary = sourceHealth.body?.summary;
  if (!sourceHealth.okStatus || !sourceSummary) {
    fail("/api/health/sources returned invalid response", {
      http: sourceHealth.status,
      body: sourceHealth.body,
    });
  } else if ((sourceSummary.open ?? 0) > 0 || (sourceSummary.halfOpen ?? 0) > 0) {
    fail("/api/health/sources has open circuit breakers", sourceSummary);
  }

  if (process.exitCode) return;
  console.log("\nPASS - live production health is green for blocking checks.");
}

main().catch((err) => {
  fail("live health check threw", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
});
