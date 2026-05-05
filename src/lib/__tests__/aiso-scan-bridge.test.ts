import { test } from "node:test";
import assert from "node:assert/strict";

import type { AisoToolsScan } from "../aiso-tools";
import { scanRepoHomepage } from "../aiso-scan-bridge";

function completedScan(completedAt: string): AisoToolsScan {
  return {
    scanId: "scan_1",
    url: "https://example.com",
    projectName: null,
    projectUrl: null,
    source: "web",
    status: "completed",
    score: 72,
    tier: "visible",
    runtimeVisibility: 55,
    scanDurationMs: 1200,
    completedAt,
    resultUrl: "https://aiso.tools/scan/scan_1",
    dimensions: [],
    issues: [],
    promptTests: [],
  };
}

test("scanRepoHomepage returns cached completed scans newer than 30 days", async () => {
  const fresh = completedScan(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());
  let scanCalled = 0;

  const out = await scanRepoHomepage(
    {
      fullName: "owner/repo",
      websiteUrl: "https://example.com",
      aisoScan: fresh,
    },
    {
      scan: async () => {
        scanCalled += 1;
        return null;
      },
      persist: async () => undefined,
      queueRead: async () => [],
      queueAppend: async () => undefined,
    },
  );

  assert.equal(scanCalled, 0);
  assert.equal(out?.scanId, "scan_1");
});

test("scanRepoHomepage queues when no immediate scan result is returned", async () => {
  const appended: unknown[] = [];

  const out = await scanRepoHomepage(
    {
      fullName: "owner/repo",
      websiteUrl: "https://example.com",
      aisoScan: null,
    },
    {
      scan: async () => null,
      persist: async () => undefined,
      queueRead: async () => [],
      queueAppend: async (_file, row) => {
        appended.push(row);
      },
    },
  );

  assert.equal(out, null);
  assert.equal(appended.length, 1);
  const row = appended[0] as { fullName: string; websiteUrl: string; source: string };
  assert.equal(row.fullName, "owner/repo");
  assert.equal(row.websiteUrl, "https://example.com");
  assert.equal(row.source, "bridge-no-result");
});
