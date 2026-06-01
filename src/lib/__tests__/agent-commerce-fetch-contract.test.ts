import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const files = [
  "src/lib/agent-commerce/live-tokens.ts",
  "src/lib/agent-commerce/virtuals.ts",
  "src/lib/agent-commerce/agentic-market.ts",
] as const;

test("agent-commerce live external fetchers use the timeout wrapper", () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /fetchWithTimeout/,
      `${file} should call fetchWithTimeout for public upstream APIs`,
    );
  }
});
