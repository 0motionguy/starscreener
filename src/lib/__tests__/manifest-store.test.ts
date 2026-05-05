import assert from "node:assert/strict";
import test from "node:test";

import { parseManifestSnapshot, persistManifestSnapshot } from "../manifest-store";

test("parseManifestSnapshot supports legacy mcp-manifest payload", () => {
  const parsed = parseManifestSnapshot({
    id: "Acme/Server",
    tools: [{ name: "search", description: "Search tool" }],
  });

  assert.equal(parsed.skills.length, 0);
  assert.equal(parsed.agents.length, 0);
  assert.equal(parsed.mcps.length, 1);
  assert.equal(parsed.mcps[0]?.id, "acme/server");
  assert.equal(parsed.mcps[0]?.tools[0]?.name, "search");
});

test("parseManifestSnapshot normalizes skill/agent/mcp manifests", () => {
  const parsed = parseManifestSnapshot({
    sampledAt: "2026-05-05T00:00:00.000Z",
    source: "sam-02",
    manifests: {
      skills: [{ id: "Skill/One", name: "Skill One", tools: [{ name: "lint" }] }],
      agents: [{ id: "Agent/One", name: "Agent One", version: "1.0.0", tools: [{ name: "run" }] }],
      mcps: [{ id: "MCP/One", endpoint: "https://example.com/mcp", tools: [{ name: "list" }] }],
    },
  });

  assert.equal(parsed.skills[0]?.id, "skill/one");
  assert.equal(parsed.agents[0]?.id, "agent/one");
  assert.equal(parsed.mcps[0]?.id, "mcp/one");
  assert.equal(parsed.mcps[0]?.endpoint, "https://example.com/mcp");
});

test("persistManifestSnapshot writes normalized manifests", async () => {
  const writes: Array<{ key: string; value: unknown }> = [];
  const store = {
    write: async (key: string, value: unknown) => {
      writes.push({ key, value });
    },
  };

  await persistManifestSnapshot(
    "mcp-manifest:acme/server",
    {
      manifests: {
        skills: [{ id: "S/1", name: "S1", tools: [{ name: "a" }] }],
        agents: [{ id: "A/1", name: "A1", tools: [{ name: "b" }] }],
        mcps: [{ id: "M/1", tools: [{ name: "c" }] }],
      },
    },
    store as never,
  );

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.key, "mcp-manifest:acme/server");
  const payload = writes[0]?.value as {
    manifests?: {
      skills?: Array<{ id: string }>;
      agents?: Array<{ id: string }>;
      mcps?: Array<{ id: string }>;
    };
  };
  assert.equal(payload.manifests?.skills?.[0]?.id, "s/1");
  assert.equal(payload.manifests?.agents?.[0]?.id, "a/1");
  assert.equal(payload.manifests?.mcps?.[0]?.id, "m/1");
});
