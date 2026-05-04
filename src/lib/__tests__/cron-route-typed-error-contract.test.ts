import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

type CronRouteModule = {
  GET?: (request: NextRequest) => Promise<Response> | Response;
  POST?: (request: NextRequest) => Promise<Response> | Response;
};

type CronRouteCase = {
  name: string;
  path: string;
  method: "GET" | "POST";
  modulePath: string;
};

const ROUTES: CronRouteCase[] = [
  { name: "aiso-drain", path: "/api/cron/aiso-drain", method: "POST", modulePath: "@/app/api/cron/aiso-drain/route" },
  { name: "digest-weekly", path: "/api/cron/digest/weekly", method: "POST", modulePath: "@/app/api/cron/digest/weekly/route" },
  { name: "freshness-state", path: "/api/cron/freshness/state", method: "GET", modulePath: "@/app/api/cron/freshness/state/route" },
  { name: "llm-aggregate", path: "/api/cron/llm/aggregate", method: "GET", modulePath: "@/app/api/cron/llm/aggregate/route" },
  { name: "llm-sync-models", path: "/api/cron/llm/sync-models", method: "GET", modulePath: "@/app/api/cron/llm/sync-models/route" },
  { name: "mcp-rotate-usage", path: "/api/cron/mcp/rotate-usage", method: "POST", modulePath: "@/app/api/cron/mcp/rotate-usage/route" },
  { name: "news-auto-recover", path: "/api/cron/news-auto-recover", method: "POST", modulePath: "@/app/api/cron/news-auto-recover/route" },
  { name: "predictions", path: "/api/cron/predictions", method: "POST", modulePath: "@/app/api/cron/predictions/route" },
  { name: "predictions-calibrate", path: "/api/cron/predictions/calibrate", method: "POST", modulePath: "@/app/api/cron/predictions/calibrate/route" },
  { name: "twitter-daily", path: "/api/cron/twitter-daily", method: "POST", modulePath: "@/app/api/cron/twitter-daily/route" },
  { name: "twitter-weekly-recap", path: "/api/cron/twitter-weekly-recap", method: "POST", modulePath: "@/app/api/cron/twitter-weekly-recap/route" },
  { name: "webhooks-flush", path: "/api/cron/webhooks/flush", method: "POST", modulePath: "@/app/api/cron/webhooks/flush/route" },
  { name: "webhooks-scan", path: "/api/cron/webhooks/scan", method: "POST", modulePath: "@/app/api/cron/webhooks/scan/route" },
];

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

async function invoke(
  route: CronRouteCase,
  request: NextRequest,
): Promise<Response> {
  const mod = (await import(route.modulePath)) as CronRouteModule;
  const handler = route.method === "GET" ? mod.GET : mod.POST;
  if (!handler) {
    throw new Error(`[${route.name}] missing ${route.method} handler`);
  }
  return await handler(request);
}

for (const route of ROUTES) {
  test(`[cron auth contract] ${route.name}: unauthorized -> 401 typed envelope`, async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.CRON_SECRET = "cron-test-secret";
    const req = new NextRequest(`https://trendingrepo.com${route.path}`, {
      method: route.method,
    });
    const res = await invoke(route, req);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, reason: "unauthorized" });
  });

  test(`[cron auth contract] ${route.name}: missing secret -> 503 typed envelope`, async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.CRON_SECRET;
    const req = new NextRequest(`https://trendingrepo.com${route.path}`, {
      method: route.method,
    });
    const res = await invoke(route, req);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      ok: false,
      reason: "CRON_SECRET not configured",
    });
  });
}

test.after(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
});
