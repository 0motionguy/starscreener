// StarScreener — Portal manifest validator tests.
// Mirrors a subset of the upstream v0.1 spec vectors so a drift in the
// lean validator gets caught here before the upstream conformance runner
// gets a chance to reject us.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import { validateManifest } from "../validate";

const GOOD_MANIFEST = {
  portal_version: "0.1",
  name: "Test Service",
  brief: "A short brief for visiting LLMs.",
  tools: [
    {
      name: "ping",
      description: "No-op tool.",
      params: { msg: { type: "string", required: false } },
    },
  ],
  call_endpoint: "https://example.com/portal/call",
  auth: "none",
  pricing: { model: "free" },
};

test("validateManifest accepts a minimal valid manifest", () => {
  const { ok, errors } = validateManifest(GOOD_MANIFEST);
  assert.equal(ok, true, errors.join("; "));
});

test("validateManifest rejects missing required fields", () => {
  const m = { ...GOOD_MANIFEST } as Record<string, unknown>;
  delete m.call_endpoint;
  const { ok, errors } = validateManifest(m);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("call_endpoint")));
});

test("validateManifest rejects portal_version mismatch", () => {
  const m = { ...GOOD_MANIFEST, portal_version: "0.2" };
  const { ok } = validateManifest(m);
  assert.equal(ok, false);
});

test("validateManifest rejects unknown top-level fields", () => {
  const m = { ...GOOD_MANIFEST, extra_field: "bad" };
  const { ok, errors } = validateManifest(m);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("extra_field")));
});

test("validateManifest rejects bad tool names", () => {
  const m = {
    ...GOOD_MANIFEST,
    tools: [{ name: "BadName", description: "x" }],
  };
  const { ok } = validateManifest(m);
  assert.equal(ok, false);
});

test("validateManifest forbids params + paramsSchema together", () => {
  const m = {
    ...GOOD_MANIFEST,
    tools: [
      {
        name: "t",
        params: { a: { type: "string" } },
        paramsSchema: { type: "object" },
      },
    ],
  };
  const { ok, errors } = validateManifest(m);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("cannot declare both")));
});

test("validateManifest rejects pricing.model x402 without rate", () => {
  const m = {
    ...GOOD_MANIFEST,
    pricing: { model: "x402" },
  };
  const { ok, errors } = validateManifest(m);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("rate")));
});

test("validateManifest requires non-empty tools array", () => {
  const m = { ...GOOD_MANIFEST, tools: [] };
  const { ok } = validateManifest(m);
  assert.equal(ok, false);
});
