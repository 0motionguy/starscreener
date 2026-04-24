// Tests for the centralized TrustMRR slug/URL helper. The intake, admin UI,
// overlay loader, and sync script all route through this module — if the
// shape assumptions drift, the drift lands here first.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTrustmrrSlug,
  trustmrrProfileUrl,
} from "../trustmrr-url";

test("normalizeTrustmrrSlug accepts bare slugs", () => {
  assert.equal(normalizeTrustmrrSlug("gumroad"), "gumroad");
  assert.equal(normalizeTrustmrrSlug("  Gumroad  "), "gumroad");
  assert.equal(normalizeTrustmrrSlug("my-cool_slug-123"), "my-cool_slug-123");
});

test("normalizeTrustmrrSlug accepts the canonical /startup/ URL form", () => {
  assert.equal(
    normalizeTrustmrrSlug("https://trustmrr.com/startup/gumroad"),
    "gumroad",
  );
  assert.equal(
    normalizeTrustmrrSlug("https://trustmrr.com/startup/anonymous-startup"),
    "anonymous-startup",
  );
});

test("normalizeTrustmrrSlug accepts the legacy /s/ short-alias form", () => {
  assert.equal(
    normalizeTrustmrrSlug("https://trustmrr.com/s/gumroad"),
    "gumroad",
  );
  assert.equal(
    normalizeTrustmrrSlug("http://trustmrr.com/s/Gumroad"),
    "gumroad",
  );
});

test("normalizeTrustmrrSlug tolerates trailing path and query noise", () => {
  assert.equal(
    normalizeTrustmrrSlug("https://trustmrr.com/startup/gumroad/"),
    "gumroad",
  );
  assert.equal(
    normalizeTrustmrrSlug("https://trustmrr.com/startup/gumroad?utm=x"),
    "gumroad",
  );
});

test("normalizeTrustmrrSlug rejects invalid input", () => {
  assert.equal(normalizeTrustmrrSlug(""), null);
  assert.equal(normalizeTrustmrrSlug("   "), null);
  assert.equal(normalizeTrustmrrSlug("has spaces"), null);
  assert.equal(normalizeTrustmrrSlug("with.dots"), null);
  assert.equal(normalizeTrustmrrSlug(123 as unknown as string), null);
  assert.equal(normalizeTrustmrrSlug(null as unknown as string), null);
  assert.equal(normalizeTrustmrrSlug("a".repeat(121)), null);
});

test("trustmrrProfileUrl emits the canonical /startup/ URL", () => {
  assert.equal(
    trustmrrProfileUrl("gumroad"),
    "https://trustmrr.com/startup/gumroad",
  );
});

test("trustmrrProfileUrl accepts any shape normalizeTrustmrrSlug does", () => {
  assert.equal(
    trustmrrProfileUrl("https://trustmrr.com/s/Gumroad"),
    "https://trustmrr.com/startup/gumroad",
  );
  assert.equal(
    trustmrrProfileUrl("https://trustmrr.com/startup/gumroad/"),
    "https://trustmrr.com/startup/gumroad",
  );
});

test("trustmrrProfileUrl throws on invalid slugs", () => {
  assert.throws(() => trustmrrProfileUrl(""));
  assert.throws(() => trustmrrProfileUrl("has spaces"));
});
