import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

describe("home page data honesty", () => {
  it("does not render repo fallback rows as Skills top 5", () => {
    expect(source).not.toContain(
      ': topCategoryFallback(repos, ["ai-agents", "ai-ml", "devtools"], 5)',
    );
  });

  it("does not synthesize Skills or MCP sparklines from signal score", () => {
    expect(source).not.toContain("sparkline: buildSyntheticSparkline");
  });

  it("caps the landing consensus panel at three rows", () => {
    const match = source.match(/const consensusRepos =[\s\S]*?\.slice\(0, (\d+)\);/);

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(3);
  });

  it("does not use render-order counters or wall-clock dates in homepage HTML", () => {
    expect(source).not.toContain("__sparkGradId");
    expect(source).not.toContain("Date.now() - 365");
  });
});
