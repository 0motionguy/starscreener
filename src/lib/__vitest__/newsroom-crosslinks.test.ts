import { describe, expect, it } from "vitest";
import {
  getNewsroomCrossLink,
  listNewsroomCrossLinks,
} from "@/lib/newsroom-crosslinks";

describe("newsroom cross-links", () => {
  it("stores at least five configured cross-links", () => {
    expect(listNewsroomCrossLinks().length).toBeGreaterThanOrEqual(5);
  });

  it("resolves links case-insensitively by repo full name", () => {
    const hit = getNewsroomCrossLink("Anthropics/Claude-Code");
    expect(hit).not.toBeNull();
    expect(hit?.newsroomUrl).toContain("agnt.newsroom");
  });

  it("returns null for unknown repos", () => {
    expect(getNewsroomCrossLink("unknown/does-not-exist")).toBeNull();
  });
});

