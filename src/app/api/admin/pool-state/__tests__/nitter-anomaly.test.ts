import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAnomalies,
  shouldFlagDeadNitterInstance,
  type AdminPoolStateResponse,
  type NitterInstanceRow,
} from "../route";

const NOW = Date.parse("2026-05-04T13:00:00.000Z");

function row(overrides: Partial<NitterInstanceRow>): NitterInstanceRow {
  return {
    url: "https://nitter.example",
    status: "dead",
    lastChecked: "2026-05-03T11:59:59.000Z",
    deadCount24h: 1,
    successRate24h: null,
    ...overrides,
  };
}

test("shouldFlagDeadNitterInstance: requires dead count in addition to stale >24h", () => {
  const staleNoCount = row({ deadCount24h: 0 });
  assert.equal(shouldFlagDeadNitterInstance(staleNoCount, NOW), false);

  const staleWithCount = row({ deadCount24h: 2 });
  assert.equal(shouldFlagDeadNitterInstance(staleWithCount, NOW), true);
});

test("shouldFlagDeadNitterInstance: does not flag fresh dead rows", () => {
  const freshDead = row({
    lastChecked: "2026-05-04T12:30:00.000Z",
    deadCount24h: 5,
  });
  assert.equal(shouldFlagDeadNitterInstance(freshDead, NOW), false);
});

test("buildAnomalies: raises RED when Nitter quorum is lost even with fresh checks", () => {
  const nitterInstances: NitterInstanceRow[] = [
    row({ url: "https://n1.example", lastChecked: "2026-05-04T12:59:00.000Z" }),
    row({ url: "https://n2.example", lastChecked: "2026-05-04T12:59:00.000Z" }),
    row({ url: "https://n3.example", lastChecked: "2026-05-04T12:59:00.000Z" }),
    row({ url: "https://n4.example", lastChecked: "2026-05-04T12:59:00.000Z" }),
    row({ url: "https://n5.example", status: "healthy", deadCount24h: 0, lastChecked: "2026-05-04T12:59:00.000Z" }),
  ];
  const github: AdminPoolStateResponse["github"] = {
    totalConfigured: 1,
    health: "GREEN",
    rows: [],
  };
  const reddit: AdminPoolStateResponse["reddit"] = {
    totalConfigured: 1,
    health: "GREEN",
    rows: [],
    rateLimitedLastHour: 0,
    rateLimitedLast30Min: 0,
    requestsLast30Min: 0,
  };
  const twitter: AdminPoolStateResponse["twitter"] = {
    apify: {
      lastSuccess: null,
      lastFailure: null,
      estimatedQuotaState: "unknown",
      status: "GREEN",
    },
    sources: [],
    nitterInstances,
    degradationRate24h: 0,
  };

  const withHeadroom = buildAnomalies(github, reddit, twitter, []);
  assert.equal(withHeadroom.some((a) => a.label === "Nitter quorum lost" && a.severity === "RED"), true);
});
