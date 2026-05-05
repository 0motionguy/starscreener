import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAnomalies,
  buildRateLimitHeadroom,
  type AdminPoolStateResponse,
  type RateLimitHeadroomRow,
} from "../route";

test("buildRateLimitHeadroom: marks github RED when remaining quota is critically low", () => {
  const github: AdminPoolStateResponse["github"] = {
    totalConfigured: 2,
    health: "YELLOW",
    rows: [
      {
        fingerprint: "gh-a",
        requests24h: 10,
        success24h: 10,
        fail24h: 0,
        lastCallAt: "2026-05-05T00:00:00.000Z",
        lastOperation: "x",
        lastStatusCode: 200,
        lastResponseMs: 100,
        lastRateLimitRemaining: 200,
        lastRateLimitReset: "2026-05-05T01:00:00.000Z",
        quarantine: { active: false, reason: null, until: null },
        idle: false,
        status: "GREEN",
      },
      {
        fingerprint: "gh-b",
        requests24h: 10,
        success24h: 10,
        fail24h: 0,
        lastCallAt: "2026-05-05T00:00:00.000Z",
        lastOperation: "x",
        lastStatusCode: 200,
        lastResponseMs: 100,
        lastRateLimitRemaining: 300,
        lastRateLimitReset: "2026-05-05T01:00:00.000Z",
        quarantine: { active: false, reason: null, until: null },
        idle: false,
        status: "GREEN",
      },
    ],
  };
  const reddit: AdminPoolStateResponse["reddit"] = {
    totalConfigured: 1,
    health: "GREEN",
    rows: [],
    rateLimitedLastHour: 0,
  };
  const twitter: AdminPoolStateResponse["twitter"] = {
    apify: {
      lastSuccess: null,
      lastFailure: null,
      estimatedQuotaState: "unknown",
      status: "GREEN",
    },
    sources: [],
    nitterInstances: [],
    degradationRate24h: 0,
  };

  const headroom = buildRateLimitHeadroom(github, reddit, twitter);
  const gh = headroom.find((row) => row.source === "github");
  assert.ok(gh);
  assert.equal(gh.status, "RED");
});

test("buildAnomalies: emits headroom anomaly for non-green source", () => {
  const github: AdminPoolStateResponse["github"] = {
    totalConfigured: 0,
    health: "DEAD",
    rows: [],
  };
  const reddit: AdminPoolStateResponse["reddit"] = {
    totalConfigured: 0,
    health: "GREEN",
    rows: [],
    rateLimitedLastHour: 0,
  };
  const twitter: AdminPoolStateResponse["twitter"] = {
    apify: {
      lastSuccess: null,
      lastFailure: null,
      estimatedQuotaState: "unknown",
      status: "GREEN",
    },
    sources: [],
    nitterInstances: [],
    degradationRate24h: 0,
  };
  const headroom: RateLimitHeadroomRow[] = [
    {
      source: "github",
      status: "RED",
      headroomPct: 0.05,
      detail: "critical quota",
    },
    {
      source: "reddit",
      status: "GREEN",
      headroomPct: 0.95,
      detail: "healthy",
    },
    {
      source: "twitter-apify",
      status: "GREEN",
      headroomPct: 0.8,
      detail: "healthy",
    },
  ];

  const anomalies = buildAnomalies(github, reddit, twitter, headroom);
  assert.equal(
    anomalies.some(
      (row) =>
        row.label === "github rate-limit headroom" && row.severity === "RED",
    ),
    true,
  );
});
