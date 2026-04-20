import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeRepoReference,
  normalizeShareUrl,
  summarizeRepoSubmissionQueue,
  validateRepoSubmissionInput,
  type RepoSubmissionRecord,
} from "../../repo-submissions";

test("normalizeRepoReference accepts bare owner/name", () => {
  const parsed = normalizeRepoReference("openai/openai-agents-python");
  assert.deepEqual(parsed, {
    fullName: "openai/openai-agents-python",
    normalizedFullName: "openai/openai-agents-python",
    repoUrl: "https://github.com/openai/openai-agents-python",
  });
});

test("normalizeRepoReference accepts github URLs and strips .git", () => {
  const parsed = normalizeRepoReference(
    "https://github.com/vercel/next.js.git?tab=readme-ov-file",
  );
  assert.deepEqual(parsed, {
    fullName: "vercel/next.js",
    normalizedFullName: "vercel/next.js",
    repoUrl: "https://github.com/vercel/next.js",
  });
});

test("normalizeRepoReference rejects non-github URLs", () => {
  assert.equal(normalizeRepoReference("https://gitlab.com/acme/demo"), null);
});

test("normalizeShareUrl keeps valid x.com links", () => {
  const normalized = normalizeShareUrl("https://x.com/demo/status/123");
  assert.equal(normalized, "https://x.com/demo/status/123");
});

test("validateRepoSubmissionInput rejects non-twitter share links", () => {
  const parsed = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    shareUrl: "https://example.com/post/123",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /x\.com or twitter\.com/);
  }
});

test("summarizeRepoSubmissionQueue counts pending and boosted rows", () => {
  const records: RepoSubmissionRecord[] = [
    {
      id: "1",
      fullName: "acme/demo",
      normalizedFullName: "acme/demo",
      repoUrl: "https://github.com/acme/demo",
      whyNow: null,
      contact: null,
      shareUrl: null,
      boostedByShare: false,
      source: "web",
      status: "pending",
      submittedAt: "2026-04-20T08:00:00.000Z",
    },
    {
      id: "2",
      fullName: "acme/boosted",
      normalizedFullName: "acme/boosted",
      repoUrl: "https://github.com/acme/boosted",
      whyNow: "moving fast",
      contact: "@acme",
      shareUrl: "https://x.com/acme/status/1",
      boostedByShare: true,
      source: "web",
      status: "pending",
      submittedAt: "2026-04-20T09:00:00.000Z",
    },
  ];

  assert.deepEqual(summarizeRepoSubmissionQueue(records), {
    pending: 2,
    boosted: 1,
    latestSubmittedAt: "2026-04-20T09:00:00.000Z",
  });
});
