import assert from "node:assert/strict";
import { test } from "node:test";

import type { AisoToolsScan } from "../../aiso-tools";
import type { RepoProfile, RepoProfilesFile } from "../../repo-profiles";
import { summarizeRepoProfileStatus } from "../../repo-profile-status";

const NOW = new Date("2026-05-19T12:00:00.000Z");

function makeScan(overrides: Partial<AisoToolsScan> = {}): AisoToolsScan {
  return {
    scanId: "scan-1",
    url: "https://example.com",
    projectName: null,
    projectUrl: null,
    source: "trendingrepo",
    status: "completed",
    score: 80,
    tier: "visible",
    runtimeVisibility: 80,
    scanDurationMs: 1000,
    completedAt: "2026-05-19T10:00:00.000Z",
    resultUrl: "https://aiso.tools/scan/scan-1",
    dimensions: [],
    issues: [],
    promptTests: [],
    ...overrides,
  };
}

function makeProfile(
  fullName: string,
  overrides: Partial<RepoProfile> = {},
): RepoProfile {
  return {
    fullName,
    rank: 100,
    selectedFrom: "test",
    websiteUrl: "https://example.com",
    websiteSource: "github_homepage",
    status: "scan_pending",
    lastProfiledAt: "2026-05-19T09:00:00.000Z",
    nextScanAfter: null,
    surfaces: {
      githubUrl: `https://github.com/${fullName}`,
      docsUrl: null,
      npmPackages: [],
      productHuntLaunchId: null,
    },
    aisoScan: null,
    expertTrendBrief: null,
    error: null,
    ...overrides,
  };
}

test("summarizes repo-profile AISO backlog, budget, and expert brief coverage", () => {
  const file: RepoProfilesFile = {
    generatedAt: "2026-05-19T11:00:00.000Z",
    version: 1,
    selection: {
      source: "catchup",
      limit: 10,
      maxScans: 5,
      dailyScanBudget: 3,
      scanned: 1,
      queued: 2,
      noWebsite: 1,
      failed: 1,
      expertBriefs: 1,
    },
    profiles: [
      makeProfile("alpha/scanned", {
        rank: 1,
        status: "scanned",
        aisoScan: makeScan({ scanId: "recent-completed" }),
        expertTrendBrief: {
          provider: "kimi",
          model: "moonshot-v1-auto",
          generatedAt: "2026-05-19T10:30:00.000Z",
          headline: "Alpha is accelerating",
          summary: "Alpha is trending because adoption is growing.",
          drivers: ["new integrations"],
          evidence: ["stars are rising"],
          caveats: ["early signal"],
        },
      }),
      makeProfile("beta/pending", {
        rank: 2,
        status: "scan_pending",
        websiteUrl: "https://beta.example",
      }),
      makeProfile("gamma/running", {
        rank: 3,
        status: "scan_running",
        websiteUrl: "https://gamma.example",
        aisoScan: makeScan({
          scanId: "running-fallback",
          status: "running",
          completedAt: null,
        }),
      }),
      makeProfile("delta/failed", {
        rank: 4,
        status: "scan_failed",
        websiteUrl: "https://delta.example",
        error: "AISO submit failed",
      }),
      makeProfile("epsilon/limited", {
        rank: 5,
        status: "rate_limited",
        websiteUrl: "https://epsilon.example",
        lastProfiledAt: "2026-05-17T00:00:00.000Z",
        aisoScan: makeScan({
          scanId: "old-limited",
          completedAt: "2026-05-17T00:00:00.000Z",
        }),
      }),
      makeProfile("zeta/none", {
        rank: 6,
        status: "no_website",
        websiteUrl: null,
        websiteSource: null,
      }),
    ],
  };

  const summary = summarizeRepoProfileStatus(file, {
    now: NOW,
    backlogLimit: 3,
  });

  assert.deepEqual(summary.counts, {
    total: 6,
    scanned: 1,
    scanPending: 1,
    scanRunning: 1,
    queued: 2,
    noWebsite: 1,
    scanFailed: 1,
    rateLimited: 1,
    failed: 2,
    withAiso: 3,
    withExpertBrief: 1,
    actionableBacklog: 4,
  });
  assert.deepEqual(summary.budget, {
    dailyScanBudget: 3,
    recentAisoSubmissions24h: 2,
    remainingToday: 1,
    windowHours: 24,
    latestAisoScanAt: "2026-05-19T10:00:00.000Z",
  });
  assert.deepEqual(
    summary.backlogPreview.map((row) => [row.fullName, row.status, row.websiteUrl]),
    [
      ["beta/pending", "scan_pending", "https://beta.example"],
      ["gamma/running", "scan_running", "https://gamma.example"],
      ["delta/failed", "scan_failed", "https://delta.example"],
    ],
  );
});
