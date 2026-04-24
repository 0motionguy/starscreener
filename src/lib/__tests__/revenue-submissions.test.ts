// Tests for revenue-submissions intake. The transactional read-modify-write
// path (mutateJsonlFile) is the sneaky piece: two concurrent submits on the
// same repo must not both pass the duplicate check, and a submit landing
// during an approve/reject must not be overwritten by the rewrite.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Route all persistence into an isolated temp dir before anything else
// imports the storage layer. STARSCREENER_DATA_DIR is read at call time
// (see currentDataDir), so setting it here is enough.
const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-revenue-test-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

import {
  REVENUE_SUBMISSIONS_FILE,
  listRevenueSubmissions,
  submitRevenueToQueue,
  updateRevenueSubmissionStatus,
  validateRevenueSubmissionInput,
} from "../revenue-submissions";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort; the tmp dir cleans itself up on reboot
  }
});

async function clearStore() {
  // An explicit zero-byte file — writeJsonlFile([]) is the canonical
  // "persisted but empty" state.
  await writeJsonlFile(REVENUE_SUBMISSIONS_FILE, []);
}

beforeEach(async () => {
  await clearStore();
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test("validateRevenueSubmissionInput — accepts a canonical trustmrr_link body", () => {
  const result = validateRevenueSubmissionInput({
    mode: "trustmrr_link",
    repo: "vercel/next.js",
    trustmrrSlug: "vercel",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.mode, "trustmrr_link");
    if (result.value.mode === "trustmrr_link") {
      assert.equal(result.value.trustmrrSlug, "vercel");
    }
  }
});

test("validateRevenueSubmissionInput — accepts a full /startup/ URL and reduces to slug", () => {
  const result = validateRevenueSubmissionInput({
    mode: "trustmrr_link",
    repo: "vercel/next.js",
    trustmrrSlug: "https://trustmrr.com/startup/vercel",
  });
  assert.equal(result.ok, true);
  if (result.ok && result.value.mode === "trustmrr_link") {
    assert.equal(result.value.trustmrrSlug, "vercel");
  }
});

test("validateRevenueSubmissionInput — accepts the /s/ short-alias URL", () => {
  const result = validateRevenueSubmissionInput({
    mode: "trustmrr_link",
    repo: "vercel/next.js",
    trustmrrSlug: "https://trustmrr.com/s/vercel",
  });
  assert.equal(result.ok, true);
  if (result.ok && result.value.mode === "trustmrr_link") {
    assert.equal(result.value.trustmrrSlug, "vercel");
  }
});

test("validateRevenueSubmissionInput — rejects an invalid slug shape", () => {
  const result = validateRevenueSubmissionInput({
    mode: "trustmrr_link",
    repo: "vercel/next.js",
    trustmrrSlug: "has spaces",
  });
  assert.equal(result.ok, false);
});

test("validateRevenueSubmissionInput — self_report requires provider and mrr", () => {
  const missingProvider = validateRevenueSubmissionInput({
    mode: "self_report",
    repo: "vercel/next.js",
    mrrCents: 1000,
  });
  assert.equal(missingProvider.ok, false);

  const badProvider = validateRevenueSubmissionInput({
    mode: "self_report",
    repo: "vercel/next.js",
    mrrCents: 1000,
    paymentProvider: "venmo",
  });
  assert.equal(badProvider.ok, false);

  const negativeMrr = validateRevenueSubmissionInput({
    mode: "self_report",
    repo: "vercel/next.js",
    mrrCents: -1,
    paymentProvider: "stripe",
  });
  assert.equal(negativeMrr.ok, false);

  const ok = validateRevenueSubmissionInput({
    mode: "self_report",
    repo: "vercel/next.js",
    mrrCents: 1000,
    paymentProvider: "stripe",
  });
  assert.equal(ok.ok, true);
});

// ---------------------------------------------------------------------------
// Duplicate / idempotency behavior
// ---------------------------------------------------------------------------

test("submitRevenueToQueue — second submit for the same repo returns duplicate", async () => {
  const first = await submitRevenueToQueue({
    mode: "self_report",
    repo: "acme/widgets",
    mrrCents: 50_000,
    customers: 10,
    paymentProvider: "stripe",
    proofUrl: null,
    contact: null,
    notes: null,
  });
  assert.equal(first.kind, "created");

  const second = await submitRevenueToQueue({
    mode: "self_report",
    repo: "Acme/Widgets",
    mrrCents: 99_999,
    customers: 20,
    paymentProvider: "stripe",
    proofUrl: null,
    contact: null,
    notes: null,
  });
  assert.equal(second.kind, "duplicate");
  assert.equal(second.submission.fullName, first.submission.fullName);

  // Verify we still only have the one row in the file.
  const all = await listRevenueSubmissions();
  assert.equal(all.length, 1);
});

test("submitRevenueToQueue — two concurrent submits for the same repo produce exactly one row", async () => {
  // This is the whole point of mutateJsonlFile: without the per-file lock,
  // both submits would read the empty snapshot, both fail the duplicate
  // check, and both append. With the lock, exactly one wins.
  const runs = await Promise.all(
    Array.from({ length: 5 }, () =>
      submitRevenueToQueue({
        mode: "self_report",
        repo: "concurrent/repo",
        mrrCents: 1_000,
        customers: null,
        paymentProvider: "stripe",
        proofUrl: null,
        contact: null,
        notes: null,
      }),
    ),
  );
  const createdCount = runs.filter((r) => r.kind === "created").length;
  const duplicateCount = runs.filter((r) => r.kind === "duplicate").length;
  assert.equal(createdCount, 1, "only the first write should create");
  assert.equal(duplicateCount, 4);
  const all = await listRevenueSubmissions();
  assert.equal(all.length, 1);
});

test("submitRevenueToQueue — a concurrent submit during moderation is not dropped", async () => {
  // Seed a pending row we'll approve, plus kick off a submit for a different
  // repo at the same time. The approve path rewrites the whole JSONL; the
  // submit appends. Without serialization, the rewrite can land after the
  // append reads the snapshot but before it writes, silently losing the
  // newly-appended row. With the lock in place, both should be present.
  const seeded = await submitRevenueToQueue({
    mode: "self_report",
    repo: "established/repo",
    mrrCents: 5_000,
    customers: 5,
    paymentProvider: "stripe",
    proofUrl: null,
    contact: null,
    notes: null,
  });
  assert.equal(seeded.kind, "created");

  const [approved, submitted] = await Promise.all([
    updateRevenueSubmissionStatus(seeded.submission.id, {
      status: "approved",
      moderationNote: null,
    }),
    submitRevenueToQueue({
      mode: "self_report",
      repo: "late/arrival",
      mrrCents: 7_000,
      customers: 7,
      paymentProvider: "stripe",
      proofUrl: null,
      contact: null,
      notes: null,
    }),
  ]);
  assert.equal(approved.status, "approved");
  assert.equal(submitted.kind, "created");

  const all = await listRevenueSubmissions();
  const fullNames = all.map((r) => r.fullName).sort();
  assert.deepEqual(fullNames, ["established/repo", "late/arrival"]);
  // And the approval actually took effect in the persisted row.
  const stored = all.find((r) => r.id === seeded.submission.id);
  assert.ok(stored);
  assert.equal(stored?.status, "approved");
});
