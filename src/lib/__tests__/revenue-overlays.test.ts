// Overlay-loader tests — the important invariants are:
//  1. An approved trustmrr_link claim surfaces as tier "trustmrr_claim",
//     NEVER as "verified_trustmrr". This is the guardrail against rendering
//     a claim with verified chrome on the repo detail page.
//  2. getTrustmrrClaimOverlay is a fallback: when a verified overlay already
//     exists for the repo, the claim overlay must be suppressed so we don't
//     double-surface on the panel.
//  3. Self-reported overlays load from approved self_report rows only.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-overlay-test-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

import {
  REVENUE_SUBMISSIONS_FILE,
  submitRevenueToQueue,
  updateRevenueSubmissionStatus,
} from "../revenue-submissions";
import {
  getTrustmrrClaimOverlay,
  getSelfReportedOverlay,
} from "../revenue-overlays";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(REVENUE_SUBMISSIONS_FILE, []);
});

test("approved trustmrr_link surfaces as tier=trustmrr_claim (never verified)", async () => {
  // "gumroad" is chosen because it exists in data/trustmrr-startups.json;
  // submitRevenueToQueue rejects slugs that aren't in the cached catalog
  // and the catalog sits at a hard-coded project-relative path. Using a
  // known slug keeps the intake happy without mocking the catalog.
  const created = await submitRevenueToQueue({
    mode: "trustmrr_link",
    repo: "claim-only/repo",
    trustmrrSlug: "gumroad",
    contact: null,
    notes: null,
  });
  assert.equal(created.kind, "created");
  await updateRevenueSubmissionStatus(created.submission.id, {
    status: "approved",
    moderationNote: null,
  });

  const overlay = getTrustmrrClaimOverlay("claim-only/repo");
  assert.ok(overlay, "expected an overlay for the approved claim");
  assert.equal(overlay!.tier, "trustmrr_claim");
  assert.equal(overlay!.mrrCents, null);
  assert.equal(overlay!.paymentProvider, null);
  assert.equal(
    overlay!.sourceUrl,
    "https://trustmrr.com/startup/gumroad",
    "claim overlay must point at the canonical /startup/ URL",
  );
});

test("getSelfReportedOverlay reads only approved self_report rows", async () => {
  const created = await submitRevenueToQueue({
    mode: "self_report",
    repo: "self/reported",
    mrrCents: 12_345,
    customers: 7,
    paymentProvider: "stripe",
    proofUrl: null,
    contact: null,
    notes: null,
  });
  assert.equal(created.kind, "created");

  // Pending — should not surface.
  assert.equal(getSelfReportedOverlay("self/reported"), null);

  await updateRevenueSubmissionStatus(created.submission.id, {
    status: "approved",
    moderationNote: null,
  });

  const overlay = getSelfReportedOverlay("self/reported");
  assert.ok(overlay);
  assert.equal(overlay!.tier, "self_reported");
  assert.equal(overlay!.mrrCents, 12_345);
});
