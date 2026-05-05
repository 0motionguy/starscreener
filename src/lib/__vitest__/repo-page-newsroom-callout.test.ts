import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/repo/[owner]/[name]/page.tsx"),
  "utf8",
);

describe("repo page newsroom callout wiring", () => {
  it("imports the newsroom mapping helper and callout component", () => {
    expect(source).toContain('from "@/lib/newsroom-crosslinks"');
    expect(source).toContain('from "@/components/repo-detail/NewsroomCallout"');
  });

  it("resolves a newsroom cross-link from repo.fullName and renders callout", () => {
    expect(source).toContain("getNewsroomCrossLink(repo.fullName)");
    expect(source).toContain("<NewsroomCallout link={newsroomCrossLink} />");
  });
});

