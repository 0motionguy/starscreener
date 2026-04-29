import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FooterBar, FooterLink } from "@/components/ui/FooterBar";

describe("FooterBar", () => {
  it("renders footer metadata and actions", () => {
    const { container, getByText } = render(
      <FooterBar
        meta="updated 38s ago"
        actions={<FooterLink href="/top">view all</FooterLink>}
      />,
    );

    expect(container.querySelector("footer.ds-footer.cat-foot")).toBeTruthy();
    expect(container.querySelector(".right .ds-footer-link")).toBeTruthy();
    expect(getByText("updated 38s ago")).toBeTruthy();
    expect(getByText("view all")).toBeTruthy();
  });

  it("renders external footer links", () => {
    const { getByText } = render(
      <FooterLink href="https://example.com" external>
        External
      </FooterLink>,
    );

    expect(getByText("External").getAttribute("target")).toBe("_blank");
  });
});
