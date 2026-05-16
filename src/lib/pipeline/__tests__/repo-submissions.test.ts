import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeRepoReference,
  normalizeShareUrl,
  REPO_SUBMISSION_CATEGORIES,
  REPO_SUBMISSION_TAGS,
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
    queued: 0,
    scanning: 0,
    listed: 0,
    failed: 0,
    boosted: 1,
    latestSubmittedAt: "2026-04-20T09:00:00.000Z",
  });
});

test("validateRepoSubmissionInput accepts mockup-extension fields", () => {
  const parsed = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    category: "repo",
    tags: ["AGENTS", "RAG"],
    releaseUrl: "https://github.com/openai/openai-agents-python/releases/tag/v1",
    demoUrl: "https://www.youtube.com/watch?v=abc",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.category, "repo");
    assert.deepEqual(parsed.value.tags, ["AGENTS", "RAG"]);
    assert.equal(
      parsed.value.releaseUrl,
      "https://github.com/openai/openai-agents-python/releases/tag/v1",
    );
    assert.equal(parsed.value.demoUrl, "https://www.youtube.com/watch?v=abc");
  }
});

test("validateRepoSubmissionInput rejects unknown category", () => {
  const parsed = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    category: "not-a-real-category",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /category must be one of/);
  }
});

test("validateRepoSubmissionInput rejects tags array longer than 4", () => {
  const parsed = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    tags: ["AGENTS", "RAG", "EVAL", "VECTOR", "CLI"],
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /at most 4 entries/);
  }
});

test("validateRepoSubmissionInput rejects unknown tag", () => {
  const parsed = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    tags: ["NOT_A_TAG"],
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.error, /tags must be from the known set/);
  }
});

test("validateRepoSubmissionInput rejects non-URL releaseUrl/demoUrl", () => {
  const release = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    releaseUrl: "not a url",
  });
  assert.equal(release.ok, false);

  const demo = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    demoUrl: "ftp://example.com",
  });
  assert.equal(demo.ok, false);
});

test("validateRepoSubmissionInput dedupes repeated tags", () => {
  const parsed = validateRepoSubmissionInput({
    repo: "openai/openai-agents-python",
    tags: ["AGENTS", "AGENTS", "RAG"],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value.tags, ["AGENTS", "RAG"]);
  }
});

test("REPO_SUBMISSION_CATEGORIES and REPO_SUBMISSION_TAGS are stable closed sets", () => {
  assert.deepEqual([...REPO_SUBMISSION_CATEGORIES], ["repo", "skill", "mcp"]);
  assert.equal(REPO_SUBMISSION_TAGS.length, 12);
});
