#!/usr/bin/env node
// Live production health gate for HOSTUP/Cloudflare deployments.
//
// This replaces the old GitHub-side data/_meta freshness gates for scheduled
// monitoring. Production truth now lives in Redis/worker health on HOSTUP, so
// failing a workflow because committed JSON snapshots are stale is noise.

import { pathToFileURL } from "node:url";

const BASE_URL = (
  process.env.TRENDINGREPO_URL ||
  process.env.STARSCREENER_URL ||
  "https://trendingrepo.com"
).replace(/\/+$/, "");

export function validateAppHealthBody(body) {
  const errors = [];
  if (body?.status !== "ok") {
    errors.push(`status must be ok (got ${body?.status ?? "missing"})`);
  }
  if (body?.error) {
    errors.push(`error must be absent (got ${body.error})`);
  }
  if (body?.sourceStatus !== "ok") {
    errors.push(`sourceStatus must be ok (got ${body?.sourceStatus ?? "missing"})`);
  }
  if (body?.workerStatus !== "ok") {
    errors.push(`workerStatus must be ok (got ${body?.workerStatus ?? "missing"})`);
  }
  return errors;
}

export function validateSourceHealthBody(body) {
  const errors = [];
  const summary = body?.summary;
  if (!summary || typeof summary !== "object") {
    return ["missing source health summary"];
  }

  if (typeof summary.neverAttempted !== "number") {
    errors.push("summary.neverAttempted is missing");
  }
  if (!Array.isArray(summary.neverAttemptedSources)) {
    errors.push("summary.neverAttemptedSources is missing");
  }

  const sources = body?.sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    errors.push("sources map is missing");
    return errors;
  }

  for (const [id, source] of Object.entries(sources)) {
    if (!source || typeof source !== "object") {
      errors.push(`${id}: source view is invalid`);
      continue;
    }
    if (typeof source.attempted !== "boolean") {
      errors.push(`${id}: attempted flag is missing`);
    }
    if (typeof source.totalAttempts !== "number") {
      errors.push(`${id}: totalAttempts is missing`);
    }
  }

  return errors;
}

async function fetchJson(path, okStatuses = [200]) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return {
      url,
      status: 0,
      okStatus: false,
      body: {
        error: "fetch_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
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

async function fetchRoute(path, okStatuses = [200]) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "text/html,application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return {
      path,
      url,
      status: 0,
      okStatus: false,
      contentType: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    path,
    url,
    status: res.status,
    okStatus: okStatuses.includes(res.status),
    contentType: res.headers.get("content-type") ?? null,
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
  const nonGreen = Array.isArray(body?.slugs)
    ? body.slugs.filter(
        (s) => s?.status && s.status !== "green",
      )
    : [];
  const degraded = Array.isArray(body?.slugs)
    ? body.slugs.filter(
        (s) => s?.payloadStatus === "degraded" || s?.payloadRowCount === 0,
      )
    : [];
  return {
    ok: body?.ok,
    summary,
    nonGreenSlugs: nonGreen.map((s) => ({
      slug: s.slug,
      fetcher: s.fetcher,
      status: s.status,
      blocking: s.blocking,
      ageSec: s.ageSec,
      writtenAt: s.writtenAt,
      payloadStatus: s.payloadStatus ?? null,
      payloadRowCount: s.payloadRowCount ?? null,
    })),
    degradedPayloadSlugs: degraded.map((s) => ({
      slug: s.slug,
      payloadStatus: s.payloadStatus ?? null,
      payloadRowCount: s.payloadRowCount ?? null,
    })),
  };
}

async function main() {
  console.log(`# Live production health - ${new Date().toISOString()}`);
  console.log(`base=${BASE_URL}`);

  const [appHealth, workerHealth, workerPulse, sourceHealth, adminOverview] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson("/api/worker/health"),
    fetchJson("/api/worker/pulse"),
    fetchJson("/api/health/sources", [200, 207]),
    fetchJson("/api/admin/overview", [401]),
  ]);
  const criticalRoutes = await Promise.all([
    fetchRoute("/collections"),
    fetchRoute("/collections/ai-agent-frameworks"),
    fetchRoute("/api/collections"),
    fetchRoute("/api/collections/ai-agent-frameworks"),
    fetchRoute("/api/model-usage/overview"),
    fetchRoute("/api/model-usage/models"),
    fetchRoute("/api/model-usage/rankings"),
    fetchRoute("/api/model-usage/features", [401]),
  ]);

  console.log("\n/api/health");
  console.log(
    JSON.stringify(
      {
        http: appHealth.status,
        status: appHealth.body?.status,
        sourceStatus: appHealth.body?.sourceStatus,
        workerStatus: appHealth.body?.workerStatus,
        workerSummary: appHealth.body?.workerSummary ?? null,
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

  console.log("\n/api/worker/pulse");
  console.log(
    JSON.stringify(
      {
        http: workerPulse.status,
        ok: workerPulse.body?.ok,
        source: workerPulse.body?.source,
        fresh: workerPulse.body?.fresh,
        writtenAt: workerPulse.body?.writtenAt,
        ageSeconds: workerPulse.body?.ageSeconds,
        stories: workerPulse.body?.stories,
      },
      null,
      2,
    ),
  );

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

  console.log("\n/api/admin/overview unauthenticated guard");
  console.log(
    JSON.stringify(
      {
        http: adminOverview.status,
        reason: adminOverview.body?.reason ?? null,
      },
      null,
      2,
    ),
  );

  console.log("\ncritical route coverage");
  console.log(
    JSON.stringify(
      criticalRoutes.map((route) => ({
        path: route.path,
        http: route.status,
        contentType: route.contentType,
        error: route.error ?? null,
      })),
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
  const appHealthErrors = validateAppHealthBody(appHealth.body);
  if (appHealthErrors.length > 0) {
    fail("/api/health is not strict green", {
      http: appHealth.status,
      errors: appHealthErrors,
      body: appHealth.body,
    });
  }

  if (
    !workerHealth.okStatus ||
    workerHealth.body?.ok !== true ||
    workerSummary.nonGreenSlugs.length > 0 ||
    workerSummary.degradedPayloadSlugs.length > 0
  ) {
    fail("/api/worker/health is not zero-tolerance green", {
      http: workerHealth.status,
      ...workerSummary,
    });
  }

  if (
    !workerPulse.okStatus ||
    workerPulse.body?.ok !== true ||
    workerPulse.body?.source !== "redis" ||
    workerPulse.body?.fresh !== true ||
    !(workerPulse.body?.stories > 0)
  ) {
    fail("/api/worker/pulse is not proving Redis-backed scheduler freshness", {
      http: workerPulse.status,
      body: workerPulse.body,
      expected: "200 ok with source=redis, fresh=true, stories>0",
    });
  }

  const sourceSummary = sourceHealth.body?.summary;
  const sourceHealthProofErrors = validateSourceHealthBody(sourceHealth.body);
  if (!sourceHealth.okStatus || !sourceSummary) {
    fail("/api/health/sources returned invalid response", {
      http: sourceHealth.status,
      body: sourceHealth.body,
    });
  } else if (sourceHealthProofErrors.length > 0) {
    fail("/api/health/sources lacks source attempt proof", {
      http: sourceHealth.status,
      errors: sourceHealthProofErrors,
      summary: sourceSummary,
    });
  } else if (
    (sourceSummary.open ?? 0) > 0 ||
    (sourceSummary.halfOpen ?? 0) > 0 ||
    sourceSummary.neverAttempted > 0
  ) {
    fail("/api/health/sources has degraded or unproven sources", sourceSummary);
  }

  if (
    !adminOverview.okStatus ||
    adminOverview.body?.reason !== "unauthorized"
  ) {
    fail("/api/admin/overview unauthenticated guard is not locked", {
      http: adminOverview.status,
      body: adminOverview.body,
      expected:
        "401 unauthorized. 503 means ADMIN_TOKEN is missing; 200 means admin is public.",
    });
  }

  const failedCriticalRoutes = criticalRoutes.filter((route) => !route.okStatus);
  if (failedCriticalRoutes.length > 0) {
    fail("critical route coverage failed", {
      routes: failedCriticalRoutes.map((route) => ({
        path: route.path,
        http: route.status,
        error: route.error ?? null,
        expected: route.path === "/api/model-usage/features" ? [401] : [200],
      })),
    });
  }

  if (process.exitCode) return;
  console.log("\nPASS - live production health is zero-tolerance green.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    fail("live health check threw", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });
}
