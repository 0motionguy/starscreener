import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRepoEnrichmentChecklist,
  summarizeRepoEnrichmentChecklists,
} from "@/lib/repo-enrichment-checklist";
import type { RepoProfile } from "@/lib/repo-profiles";

function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    fullName: "owner/repo",
    rank: 1,
    selectedFrom: "test",
    websiteUrl: "https://example.com",
    websiteSource: "github_homepage",
    status: "scanned",
    lastProfiledAt: "2026-05-04T00:00:00.000Z",
    nextScanAfter: null,
    surfaces: {
      githubUrl: "https://github.com/owner/repo",
      docsUrl: "https://docs.example.com",
      npmPackages: ["repo"],
      productHuntLaunchId: "ph_1",
    },
    aisoScan: {
      scanId: "scan_1",
      url: "https://example.com",
      projectName: "repo",
      projectUrl: "https://github.com/owner/repo",
      source: "test",
      status: "completed",
      score: 80,
      tier: "visible",
      runtimeVisibility: 80,
      scanDurationMs: 1000,
      completedAt: "2026-05-04T00:00:00.000Z",
      resultUrl: "https://aiso.tools/scan/scan_1",
      dimensions: [],
      issues: [],
      promptTests: [],
    },
    error: null,
    ...overrides,
  };
}

test("buildRepoEnrichmentChecklist computes per-repo completion", () => {
  const checklist = buildRepoEnrichmentChecklist(makeProfile());
  assert.equal(checklist.fullName, "owner/repo");
  assert.equal(checklist.completed, 6);
  assert.equal(checklist.total, 6);
  assert.equal(checklist.completionRatio, 1);
});

test("buildRepoEnrichmentChecklist marks missing fields as incomplete", () => {
  const checklist = buildRepoEnrichmentChecklist(
    makeProfile({
      status: "scan_failed",
      websiteUrl: null,
      surfaces: {
        githubUrl: "https://github.com/owner/repo",
        docsUrl: null,
        npmPackages: [],
        productHuntLaunchId: null,
      },
      aisoScan: null,
    }),
  );
  assert.equal(checklist.completed, 0);
  assert.equal(checklist.total, 6);
  assert.equal(checklist.completionRatio, 0);
});

test("summarizeRepoEnrichmentChecklists aggregates across repos", () => {
  const full = buildRepoEnrichmentChecklist(makeProfile());
  const empty = buildRepoEnrichmentChecklist(
    makeProfile({
      fullName: "owner/empty",
      status: "scan_failed",
      websiteUrl: null,
      surfaces: {
        githubUrl: "https://github.com/owner/empty",
        docsUrl: null,
        npmPackages: [],
        productHuntLaunchId: null,
      },
      aisoScan: null,
    }),
  );

  const summary = summarizeRepoEnrichmentChecklists([full, empty]);
  assert.equal(summary.repoCount, 2);
  assert.equal(summary.completedItems, 6);
  assert.equal(summary.totalItems, 12);
  assert.equal(summary.completionRatio, 0.5);
});
