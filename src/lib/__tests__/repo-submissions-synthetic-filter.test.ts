// Unit tests for the public synthetic-submission filter. The /drop queue and
// hero stats hide e2e/QA probe submissions (dorp-*-smoke-*, test-repo-*) that
// share the store with real drops; admin tooling still sees everything.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isSyntheticTestSubmission } from "@/lib/repo-submissions";

test("isSyntheticTestSubmission: flags synthetic test/smoke drops", () => {
  for (const normalizedFullName of [
    "basilfx/dorp-email-smoke-25272",
    "basilfx/dorp-icon-smoke-10771",
    "basilfx/test-repo-4285",
    "someone/widget-smoke-9",
  ]) {
    assert.equal(
      isSyntheticTestSubmission({ normalizedFullName }),
      true,
      `expected synthetic: ${normalizedFullName}`,
    );
  }
});

test("isSyntheticTestSubmission: keeps real submissions visible", () => {
  for (const normalizedFullName of [
    "voightxyz/voight-vercel-ai",
    "voightxyz/voight-sdk",
    "vercel/next.js",
    "openai/codex",
    "facebook/jest-test-utils", // "test" mid-name, not the synthetic shape
    "acme/test-repo-runner", // no digit suffix -> real repo, not a probe
  ]) {
    assert.equal(
      isSyntheticTestSubmission({ normalizedFullName }),
      false,
      `expected real: ${normalizedFullName}`,
    );
  }
});
