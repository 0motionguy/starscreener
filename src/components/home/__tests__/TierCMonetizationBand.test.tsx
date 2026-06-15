import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";

import { TierCMonetizationBand } from "../TierCMonetizationBand";

// Honest staleness rendering — the band swaps a card's right-aligned
// foot chip from "live" to "updating" when the underlying source is cold.
// We test both poles so a regression that drops the cold-tier guard is
// caught at commit time.

describe("TierCMonetizationBand", () => {
  test("renders three monetization cards linking to /tools/revenue-estimate, /funding, and /tools/star-history", () => {
    const now = new Date().toISOString();
    const { container } = render(
      <TierCMonetizationBand
        revenueOverlaysGeneratedAt={now}
        fundingFetchedAt={now}
      />,
    );

    const anchors = Array.from(container.querySelectorAll("a[href]"));
    const hrefs = anchors.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/tools/revenue-estimate");
    expect(hrefs).toContain("/funding");
    expect(hrefs).toContain("/tools/star-history");
  });

  test("revenue card flips to UPDATING when the overlay snapshot is cold", () => {
    const { getAllByText } = render(
      <TierCMonetizationBand
        revenueOverlaysGeneratedAt={null}
        fundingFetchedAt={new Date().toISOString()}
      />,
    );
    expect(getAllByText("UPDATING").length).toBeGreaterThan(0);
  });

  test("funding card flips to REFRESHING when the news feed is cold", () => {
    const { getAllByText } = render(
      <TierCMonetizationBand
        revenueOverlaysGeneratedAt={new Date().toISOString()}
        fundingFetchedAt={null}
      />,
    );
    expect(getAllByText("REFRESHING").length).toBeGreaterThan(0);
  });

  test("section head carries the strategic positioning copy", () => {
    const { container } = render(
      <TierCMonetizationBand
        revenueOverlaysGeneratedAt={new Date().toISOString()}
        fundingFetchedAt={new Date().toISOString()}
      />,
    );
    // SectionHead V4 renders to .v4-section-head with __title / __num / __meta.
    const title = container.querySelector(".v4-section-head__title");
    expect(title?.textContent).toContain("Monetization signals");
    expect(title?.textContent).toContain("OSSInsight");
  });

  test("daily build pill is shown when revenue snapshot is fresh", () => {
    const { getAllByText } = render(
      <TierCMonetizationBand
        revenueOverlaysGeneratedAt={new Date().toISOString()}
        fundingFetchedAt={new Date().toISOString()}
      />,
    );
    // React testing-library matches every ancestor whose textContent
    // contains the string, so the pill literal shows up on .panel-body,
    // .ds-card-body, and the chip itself. Asserting non-empty is enough.
    expect(getAllByText("DAILY BUILD").length).toBeGreaterThan(0);
  });
});
