import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

describe("AGN-793 SEO cross-link guardrails", () => {
  it("keeps AGNT Newsroom in homepage Organization sameAs links", () => {
    expect(homeSource).toContain("sameAs");
    expect(homeSource).toContain('"https://agnt.newsroom"');
  });
});

