import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Footer } from "@/components/layout/Footer";

afterEach(() => {
  cleanup();
});

const SOCIAL_HREFS = {
  LinkedIn: "https://www.linkedin.com/company/trendingrepo",
  YouTube: "https://www.youtube.com/@trendingrepo",
  Reddit: "https://www.reddit.com/r/trendingrepo",
  G2: "https://www.g2.com/products/trendingrepo",
} as const;

describe("Footer social anchors", () => {
  it("renders all 4 social anchors with their expected hrefs", () => {
    const { getByText } = render(<Footer />);

    for (const [label, expectedHref] of Object.entries(SOCIAL_HREFS)) {
      const anchor = getByText(label).closest("a");
      expect(anchor, `${label} anchor should exist`).not.toBeNull();
      expect(anchor?.getAttribute("href")).toBe(expectedHref);
    }
  });

  it("marks each social anchor as external with rel containing noreferrer", () => {
    const { getByText } = render(<Footer />);

    for (const label of Object.keys(SOCIAL_HREFS)) {
      const anchor = getByText(label).closest("a");
      expect(anchor?.getAttribute("target")).toBe("_blank");
      const rel = anchor?.getAttribute("rel") ?? "";
      expect(rel).toContain("noreferrer");
    }
  });
});
