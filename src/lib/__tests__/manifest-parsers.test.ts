import assert from "node:assert/strict";
import test from "node:test";

import { parseAgent, parseMcp, parseSkill } from "../manifest-parsers";

test("parseSkill parses frontmatter + body", () => {
  const parsed = parseSkill(`---
name: My Skill
description: Good skill
version: 1.2.3
---
# Skill Body`);
  assert.equal(parsed.name, "My Skill");
  assert.equal(parsed.version, "1.2.3");
  assert.match(parsed.body, /Skill Body/);
});

test("parseAgent parses role/capabilities/tools", () => {
  const parsed = parseAgent(`---
role: reviewer
capabilities: [lint, test]
tools: [gh, npm]
---
Agent prompt`);
  assert.equal(parsed.role, "reviewer");
  assert.deepEqual(parsed.capabilities, ["lint", "test"]);
  assert.deepEqual(parsed.tools, ["gh", "npm"]);
});

test("parseMcp parses mcp manifest json", () => {
  const parsed = parseMcp(
    JSON.stringify({
      name: "demo-mcp",
      version: "0.1.0",
      tools: [{ name: "list" }],
      resources: [{ uri: "file:///tmp/a" }],
    }),
  );
  assert.equal(parsed.name, "demo-mcp");
  assert.equal(parsed.tools.length, 1);
});

test("invalid manifest throws and can be surfaced as manifestErrors", () => {
  assert.throws(
    () => parseMcp(JSON.stringify({ name: "bad" })),
    /version/,
  );
});

test("all 4 fixture repos parse to structured manifest payloads", () => {
  const fixtures = [
    {
      repo: "acme/skill-alpha",
      kind: "skill" as const,
      content: `---
name: Alpha Skill
description: alpha
version: 0.1.0
---
skill body`,
    },
    {
      repo: "acme/agent-beta",
      kind: "agent" as const,
      content: `---
role: planner
capabilities: [triage, planning]
tools: [gh, npm]
---
agent body`,
    },
    {
      repo: "acme/mcp-gamma",
      kind: "mcp" as const,
      content: JSON.stringify({
        name: "gamma-mcp",
        version: "1.0.0",
        tools: [{ name: "search" }],
        resources: [{ uri: "file:///repo" }],
      }),
    },
    {
      repo: "acme/mcp-delta",
      kind: "mcp" as const,
      content: JSON.stringify({
        name: "delta-mcp",
        version: "2.0.0",
        tools: [],
        resources: [],
      }),
    },
  ];

  for (const fixture of fixtures) {
    if (fixture.kind === "skill") {
      const parsed = parseSkill(fixture.content);
      assert.ok(parsed.name.length > 0, fixture.repo);
    } else if (fixture.kind === "agent") {
      const parsed = parseAgent(fixture.content);
      assert.ok(parsed.role.length > 0, fixture.repo);
    } else {
      const parsed = parseMcp(fixture.content);
      assert.ok(parsed.name.length > 0, fixture.repo);
      assert.ok(parsed.version.length > 0, fixture.repo);
    }
  }
});
