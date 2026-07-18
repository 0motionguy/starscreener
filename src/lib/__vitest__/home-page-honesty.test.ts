import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/(home)/page.tsx"), "utf8");

describe("home page data honesty", () => {
  it("does not render repo fallback rows as Skills top 5", () => {
    expect(source).not.toContain(
      ': topCategoryFallback(repos, ["ai-agents", "ai-ml", "devtools"], 5)',
    );
  });

  it("does not synthesize Skills or MCP sparklines from signal score", () => {
    expect(source).not.toContain("sparkline: buildSyntheticSparkline");
  });

  // The standalone "landing consensus panel" (const consensusRepos … .slice(0, 3))
  // was removed in the unified-table home redesign: "consensus" is now a sort mode
  // (see consensusScore in src/app/(home)/page.tsx), not a separate capped panel. The
  // row-cap honesty assertion is retired with the panel it guarded.

  it("does not use render-order counters or wall-clock dates in homepage HTML", () => {
    expect(source).not.toContain("__sparkGradId");
    expect(source).not.toContain("Date.now() - 365");
  });
});
