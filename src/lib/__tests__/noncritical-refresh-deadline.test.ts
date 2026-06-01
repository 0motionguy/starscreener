import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NON_CRITICAL_REFRESH_TIMEOUT_MS,
  waitForNonCriticalRefreshes,
} from "../noncritical-refresh-deadline";

test("waitForNonCriticalRefreshes stops waiting on a hung refresh batch", async () => {
  const startedAt = Date.now();
  const status = await waitForNonCriticalRefreshes(
    [new Promise<never>(() => undefined)],
    "global chrome",
    1,
  );

  assert.equal(status, "timeout");
  assert.ok(
    Date.now() - startedAt < 500,
    "non-critical refreshes must not stall route rendering",
  );
});

test("waitForNonCriticalRefreshes reports settled batches", async () => {
  const status = await waitForNonCriticalRefreshes(
    [Promise.resolve("ok"), Promise.reject(new Error("ignored"))],
    "global chrome",
    50,
  );

  assert.equal(status, "settled");
});

test("global chrome refresh budget is short enough for every route", () => {
  assert.equal(NON_CRITICAL_REFRESH_TIMEOUT_MS, 1200);
});

test("global chrome uses soft deadlines around non-critical refreshes", () => {
  const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
  const sidebarSource = readFileSync("src/lib/sidebar-source-counts.ts", "utf8");

  assert.match(
    layoutSource,
    /waitForNonCriticalRefreshes\(\s*\[/,
    "RootLayout refresh warmups must not serialize or wait on Redis indefinitely",
  );
  assert.match(
    sidebarSource,
    /waitForNonCriticalRefreshes\(\s*\[/,
    "sidebar source-count refreshes must not wait indefinitely before rendering counts",
  );
});
