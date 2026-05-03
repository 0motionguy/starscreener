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

  it("keeps the landing consensus panel larger than three rows", () => {
    const match = source.match(/const consensusRepos =[\s\S]*?\.slice\(0, (\d+)\);/);

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(8);
  });
});
