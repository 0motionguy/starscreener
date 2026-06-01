import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("agent-commerce copy does not claim MCP health while probes are unwired", () => {
  const files = [
    "src/app/agent-commerce/page.tsx",
    "src/components/agent-commerce/AgentCommerceHero.tsx",
    "src/components/agent-commerce/AcValueStrip.tsx",
  ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
  const combined = files.join("\n");

  assert.equal(combined.includes("MCP server health"), false);
  assert.equal(combined.includes("Live status on every x402, MCP"), false);
  assert.match(combined, /MCP inventory/);
});
