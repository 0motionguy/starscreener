import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { getAisoToolsScan } from "../aiso-tools";

const ENV_KEYS = [
  "AISO_SCAN_PROTOCOL",
  "AISO_SCAN_SUBMIT_PATH",
  "AISO_SCAN_STATUS_PATH_TEMPLATE",
  "AISO_SCAN_RESULT_PATH_TEMPLATE",
  "AISO_API_URL",
  "AISO_TOOLS_API_URL",
  "AISOTOOLS_API_URL",
  "TRENDINGREPO_AISO_AUTO_SCAN",
  "STARSCREENER_AISO_AUTO_SCAN",
] as const;

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const key of ENV_KEYS) delete process.env[key];
});

test("getAisoToolsScan keeps default aiso.tools wire protocol", async () => {
  process.env.AISO_API_URL = "https://aiso.tools";
  process.env.TRENDINGREPO_AISO_AUTO_SCAN = "true";

  const calls: string[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/scan")) {
      return new Response(
        JSON.stringify({ scanId: "scan-default", status: "queued" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        scanId: "scan-default",
        url: "https://example.com",
        status: "completed",
        score: 88,
        tier: "visible",
        scanDurationMs: 123,
        completedAt: "2026-05-04T12:00:00.000Z",
        runtimeVisibility: 80,
        dimensions: [],
        issues: [],
        promptTests: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const out = await getAisoToolsScan("https://example.com");
  assert.ok(out);
  assert.equal(out?.resultUrl, "https://aiso.tools/scan/scan-default");
  assert.ok(calls.some((u) => u.endsWith("/api/scan")));
  assert.ok(calls.some((u) => u.endsWith("/api/scan/scan-default")));
});

test("getAisoToolsScan supports pluggable protocol paths", async () => {
  process.env.AISO_API_URL = "https://scanner.internal";
  process.env.AISO_SCAN_PROTOCOL = "custom-v1";
  process.env.AISO_SCAN_SUBMIT_PATH = "/v1/jobs";
  process.env.AISO_SCAN_STATUS_PATH_TEMPLATE = "/v1/jobs/{scanId}";
  process.env.AISO_SCAN_RESULT_PATH_TEMPLATE = "/reports/{scanId}";

  const calls: string[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/v1/jobs")) {
      return new Response(
        JSON.stringify({ scanId: "job-123", status: "running" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        scanId: "job-123",
        url: "https://project.example",
        status: "completed",
        score: 91,
        tier: "cited",
        scanDurationMs: 321,
        completedAt: "2026-05-04T12:10:00.000Z",
        runtimeVisibility: 90,
        dimensions: [],
        issues: [],
        promptTests: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const out = await getAisoToolsScan("https://project.example");
  assert.ok(out);
  assert.equal(out?.resultUrl, "https://scanner.internal/reports/job-123");
  assert.ok(calls.some((u) => u.endsWith("/v1/jobs")));
  assert.ok(calls.some((u) => u.endsWith("/v1/jobs/job-123")));
});
