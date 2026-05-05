import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrichCore,
  getMissingCoreFields,
  getMissingEnrichedFields,
  hasHomepage,
} from "@/lib/repo-autocomplete";
import type { RepoProfile } from "@/lib/repo-profiles";

function makeProfile(overrides: Partial<RepoProfile> = {}): RepoProfile {
  return {
    fullName: "owner/repo",
    rank: 1,
    selectedFrom: "seed",
    websiteUrl: "https://example.com",
    websiteSource: "github_homepage",
    status: "scanned",
    lastProfiledAt: "2026-05-04T00:00:00.000Z",
    nextScanAfter: "2026-05-05T00:00:00.000Z",
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
      score: 50,
      tier: "visible",
      runtimeVisibility: 50,
      scanDurationMs: 1,
      completedAt: "2026-05-04T00:00:00.000Z",
      resultUrl: null,
      dimensions: [],
      issues: [],
      promptTests: [],
    },
    error: "none",
    ...overrides,
  };
}

test("missing field detectors return empty for a complete profile", () => {
  const profile = makeProfile();
  assert.deepEqual(getMissingCoreFields(profile), []);
  assert.deepEqual(getMissingEnrichedFields(profile), []);
});

test("missing field detectors return expected paths when values are absent", () => {
  const profile = makeProfile({
    websiteUrl: null,
    websiteSource: null,
    nextScanAfter: null,
    error: null,
    surfaces: {
      githubUrl: "",
      docsUrl: null,
      npmPackages: [],
      productHuntLaunchId: null,
    },
    aisoScan: null,
  });

  assert.ok(getMissingCoreFields(profile).includes("websiteUrl"));
  assert.ok(getMissingCoreFields(profile).includes("surfaces.githubUrl"));
  assert.ok(getMissingEnrichedFields(profile).includes("surfaces.docsUrl"));
  assert.ok(getMissingEnrichedFields(profile).includes("surfaces.npmPackages"));
});

test("enrichCore merges shallow profile fields and surfaces patch", () => {
  const profile = makeProfile({ websiteUrl: null, surfaces: { githubUrl: "", docsUrl: null, npmPackages: [], productHuntLaunchId: null } });
  const next = enrichCore(profile, {
    websiteUrl: "https://new.example.com",
    surfaces: { githubUrl: "https://github.com/owner/repo", docsUrl: "https://docs.example.com", npmPackages: [], productHuntLaunchId: null },
  });
  assert.equal(next.websiteUrl, "https://new.example.com");
  assert.equal(next.surfaces.githubUrl, "https://github.com/owner/repo");
  assert.equal(hasHomepage(next), true);
});

