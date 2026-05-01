// Unit tests for V4 layout templates: LeaderboardTemplate, ProfileTemplate.
// SourceFeedTemplate has its own dedicated suite at v4-source-feed-template.test.tsx.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  LeaderboardTemplate,
  type LeaderboardBand,
} from "@/components/templates/LeaderboardTemplate";
import { ProfileTemplate } from "@/components/templates/ProfileTemplate";

afterEach(() => {
  cleanup();
});

describe("LeaderboardTemplate", () => {
  it("renders kpi + filter slots when provided", () => {
    const { container } = render(
      <LeaderboardTemplate
        title="x"
        kpiBand={<div data-testid="kpi" />}
        filterBar={<div data-testid="fil" />}
      />,
    );
    expect(container.querySelector(".v4-leaderboard-template__kpi")).not.toBeNull();
    expect(container.querySelector(".v4-leaderboard-template__filter")).not.toBeNull();
  });

  it("renders one section per band with the correct band class", () => {
    const bands: LeaderboardBand[] = [
      { key: "cons", title: "STRONG CONSENSUS", rows: <div>r</div> },
      { key: "early", title: "EARLY CALL", rows: <div>r</div> },
      { key: "div", title: "DIVERGENCE", rows: <div>r</div> },
    ];
    const { container } = render(<LeaderboardTemplate title="x" bands={bands} />);
    const sections = container.querySelectorAll(".v4-leaderboard-template__band");
    expect(sections).toHaveLength(3);
    expect(sections[0].className).toContain("--cons");
    expect(sections[1].className).toContain("--early");
    expect(sections[2].className).toContain("--div");
  });

  it("falls back to flat rows mode when bands is omitted", () => {
    const { container } = render(
      <LeaderboardTemplate
        title="x"
        rows={<div data-testid="rows" />}
        rowsEyebrow="LIST"
      />,
    );
    expect(container.querySelector(".v4-leaderboard-template__band")).toBeNull();
    expect(container.querySelector(".v4-leaderboard-template__rows")).not.toBeNull();
  });

  it("applies with-rail class only when rightRail is set", () => {
    const { container, rerender } = render(<LeaderboardTemplate title="x" />);
    expect(
      container.querySelector(".v4-leaderboard-template__body")?.className,
    ).not.toContain("--with-rail");
    rerender(
      <LeaderboardTemplate title="x" rightRail={<aside data-testid="rail" />} />,
    );
    expect(
      container.querySelector(".v4-leaderboard-template__body")?.className,
    ).toContain("--with-rail");
  });

  it("renders band meta when provided", () => {
    const bands: LeaderboardBand[] = [
      { key: "cons", title: "X", rows: <div />, meta: "7 · in band" },
    ];
    const { getByText } = render(<LeaderboardTemplate title="x" bands={bands} />);
    expect(getByText("7 · in band")).not.toBeNull();
  });
});

describe("ProfileTemplate", () => {
  it("places identity into the PageHead children slot", () => {
    const { getByText } = render(
      <ProfileTemplate identity={<div>refactoringhq/tolaria</div>} />,
    );
    expect(getByText("refactoringhq/tolaria")).not.toBeNull();
  });

  it("renders verdict / kpi / signal strip slots when provided", () => {
    const { container } = render(
      <ProfileTemplate
        verdict={<div data-testid="v" />}
        kpiBand={<div data-testid="k" />}
        signalStrip={<div data-testid="s" />}
      />,
    );
    expect(container.querySelector(".v4-profile-template__verdict")).not.toBeNull();
    expect(container.querySelector(".v4-profile-template__kpi")).not.toBeNull();
    expect(
      container.querySelector(".v4-profile-template__signal-strip"),
    ).not.toBeNull();
  });

  it("applies with-rail class when rightRail is set", () => {
    const { container } = render(
      <ProfileTemplate rightRail={<aside data-testid="r" />} mainPanels={<div />} />,
    );
    expect(
      container.querySelector(".v4-profile-template__body")?.className,
    ).toContain("--with-rail");
  });

  it("renders related grid when related prop is provided", () => {
    const { container } = render(
      <ProfileTemplate related={<div data-testid="rel" />} />,
    );
    expect(container.querySelector(".v4-profile-template__related")).not.toBeNull();
  });
});
