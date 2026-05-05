// [SAM-12] (AGN-953) — verify the documented Marco priority rule.
//
// Rule (per docs/skills-agents-mcp-priority.md):
//   kind = getCategoryKind(repo)            // "mcp" | "skill" | "agent" | "library"
//   mult = (kind === "skill" || kind === "agent" || kind === "mcp") ? 2.0 : 1.0
//   priority = stars_velocity * mult
//   tie-break by RAW stars_velocity (pre-multiplier)
//
// This test does not import the live classifier — it validates the rule
// itself against a fixture that mimics the worked example in the doc.

import { test } from "node:test";
import assert from "node:assert";

const PRIORITY_KINDS = new Set(["skill", "agent", "mcp"]);

function priorityMultiplier(kind) {
  return PRIORITY_KINDS.has(kind) ? 2.0 : 1.0;
}

function pickOrder(repos) {
  return repos
    .map((r) => ({
      ...r,
      mult: priorityMultiplier(r.kind),
      priority: r.stars_velocity * priorityMultiplier(r.kind),
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Tie-break by raw stars_velocity (pre-multiplier).
      return b.stars_velocity - a.stars_velocity;
    })
    .map((r) => `${r.owner}/${r.name}`);
}

test("multiplier is 2.0 for skill/agent/mcp, 1.0 for library", () => {
  assert.strictEqual(priorityMultiplier("skill"), 2.0);
  assert.strictEqual(priorityMultiplier("agent"), 2.0);
  assert.strictEqual(priorityMultiplier("mcp"), 2.0);
  assert.strictEqual(priorityMultiplier("library"), 1.0);
});

test("MCP/skill/agent repos jump ahead of comparable libraries", () => {
  // Mirrors the worked-example table in docs/skills-agents-mcp-priority.md.
  const repos = [
    { owner: "acme",  name: "super-fast-orm",   kind: "library", stars_velocity: 400 },
    { owner: "org",   name: "widget-mcp",       kind: "mcp",     stars_velocity: 250 },
    { owner: "solo",  name: "agent-skills-v2",  kind: "skill",   stars_velocity: 300 },
    { owner: "corp",  name: "yet-another-lint", kind: "library", stars_velocity: 150 },
  ];

  const order = pickOrder(repos);

  assert.deepStrictEqual(order, [
    "solo/agent-skills-v2",   // 300 * 2.0 = 600
    "org/widget-mcp",         // 250 * 2.0 = 500
    "acme/super-fast-orm",    // 400 * 1.0 = 400
    "corp/yet-another-lint",  // 150 * 1.0 = 150
  ]);
});

test("library still wins when its raw velocity dominates", () => {
  // A 1000-stars/d library beats a 100-stars/d MCP server (1000 > 200).
  const repos = [
    { owner: "viral", name: "meme-lib",  kind: "library", stars_velocity: 1000 },
    { owner: "tiny",  name: "weak-mcp",  kind: "mcp",     stars_velocity: 100 },
  ];
  assert.deepStrictEqual(pickOrder(repos), ["viral/meme-lib", "tiny/weak-mcp"]);
});

test("agent and skill repos are co-equal with mcp at the multiplier level", () => {
  const repos = [
    { owner: "x", name: "skill-a", kind: "skill", stars_velocity: 100 },
    { owner: "y", name: "agent-a", kind: "agent", stars_velocity: 100 },
    { owner: "z", name: "mcp-a",   kind: "mcp",   stars_velocity: 100 },
  ];
  // All three priority = 200. Tie-break is by raw stars_velocity (all equal),
  // so the original input order is preserved by stable sort.
  const order = pickOrder(repos);
  assert.strictEqual(order.length, 3);
  assert.ok(order.every((slug) => slug !== undefined));
  // All three must outrank a comparable library.
  const withLibrary = pickOrder([
    ...repos,
    { owner: "L", name: "lib-a", kind: "library", stars_velocity: 150 },
  ]);
  assert.strictEqual(withLibrary[3], "L/lib-a");
});

test("tie-break uses raw stars_velocity, not post-multiplier priority", () => {
  // Two repos with identical priority (both = 200) but different raw velocity.
  // Library at 200 raw vs MCP at 100 raw: priority = 200 each.
  // Raw stars_velocity tie-break → library (200) ranks ahead of MCP (100).
  const repos = [
    { owner: "lib",  name: "fast-lib",    kind: "library", stars_velocity: 200 },
    { owner: "mcp",  name: "slow-mcp",    kind: "mcp",     stars_velocity: 100 },
  ];
  assert.deepStrictEqual(pickOrder(repos), ["lib/fast-lib", "mcp/slow-mcp"]);
});
