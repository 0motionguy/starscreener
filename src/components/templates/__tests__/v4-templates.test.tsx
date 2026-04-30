// Unit tests for V4 layout templates: SourceFeedTemplate, LeaderboardTemplate,
// ProfileTemplate.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import {
  LeaderboardTemplate,
  type LeaderboardBand,
} from "@/components/templates/LeaderboardTemplate";
import { ProfileTemplate } from "@/components/templates/ProfileTemplate";

afterEach(() => {
  cleanup();
});

describe("SourceFeedTemplate", () => {
  it("renders crumb / h1 / lede via PageHead", () => {
    const { container, getByText } = render(
      <SourceFeedTemplate
        crumb={
          <>
            <b>HN</b> · TERMINAL
          </>
        }
        title="Hacker News"
        lede="Stories from the past 72 hours"
      />,
    );
    expect(container.querySelector(".v4-page-head__h1")?.textContent).toBe(
      "Hacker News",
    );
    expect(getByText("HN").tagName).toBe("B");
  });

  it("only renders top strip when at least one of snapshot/volume/topics is set", () => {
    const { container, rerender } = render(
      <SourceFeedTemplate title="x" />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__strip"),
    ).toBeNull();
    rerender(
      <SourceFeedTemplate
        title="x"
        snapshot={<div data-testid="snap">snap</div>}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__strip"),
    ).not.toBeNull();
  });

  it("renders one featured slot per array entry", () => {
    const { container } = render(
      <SourceFeedTemplate
        title="x"
        featured={[<div key="1">a</div>, <div key="2">b</div>, <div key="3">c</div>]}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__featured")
        ?.children.length,
    ).toBe(3);
  });

  it("renders list section only when list prop is provided", () => {
    const { container, rerender } = render(<SourceFeedTemplate title="x" />);
    expect(container.querySelector(".v4-source-feed-template__list")).toBeNull();
    rerender(<SourceFeedTemplate title="x" list={<div data-testid="l">l</div>} />);
    expect(container.querySelector(".v4-source-feed-template__list")).not.toBeNull();
  });

  it("renders foot only when prop is provided", () => {
    const { container } = render(
      <SourceFeedTemplate title="x" foot={<span data-testid="ft">ft</span>} />,
    );
    expect(container.querySelector(".v4-source-feed-template__foot")).not.toBeNull();
  });
});

describe("LeaderboardTemplate", () => {
  it("renders kpi + filter slots when provided", () => {
    const { container } = render(
      <LeaderboardTemplate
        h1="x"
        kpiBand={<div data-testid="kpi" />}
        filterBar={<div data-testid="fil" />}
      />,
    );
    expect(container.querySelector(".v4-leaderboard-template__kpi")).not.toBeNull();
    expect(container.querySelector(".v4-leaderboard-template__filters")).not.toBeNull();
  });

  it("renders one section per band with the correct band class", () => {
    const bands: LeaderboardBand[] = [
      { key: "cons", title: "STRONG CONSENSUS", rows: <div>r</div> },
      { key: "early", title: "EARLY CALL", rows: <div>r</div> },
      { key: "div", title: "DIVERGENCE", rows: <div>r</div> },
    ];
    const { container } = render(<LeaderboardTemplate h1="x" bands={bands} />);
    const sections = container.querySelectorAll(".v4-leaderboard-template__band");
    expect(sections).toHaveLength(3);
    expect(sections[0].className).toContain("--cons");
    expect(sections[1].className).toContain("--early");
    expect(sections[2].className).toContain("--div");
  });

  it("falls back to flat leaderboard mode when bands is omitted", () => {
    const { container } = render(
      <LeaderboardTemplate
        h1="x"
        leaderboard={<div data-testid="rows" />}
        leaderboardEyebrow="LIST"
      />,
    );
    expect(container.querySelector(".v4-leaderboard-template__band")).toBeNull();
    expect(
      container.querySelector(".v4-leaderboard-template__leaderboard"),
    ).not.toBeNull();
  });

  it("applies with-rail class only when rightRail is set", () => {
    const { container, rerender } = render(<LeaderboardTemplate h1="x" />);
    expect(
      container.querySelector(".v4-leaderboard-template__body")?.className,
    ).not.toContain("--with-rail");
    rerender(
      <LeaderboardTemplate h1="x" rightRail={<aside data-testid="rail" />} />,
    );
    expect(
      container.querySelector(".v4-leaderboard-template__body")?.className,
    ).toContain("--with-rail");
  });

  it("renders band meta when provided", () => {
    const bands: LeaderboardBand[] = [
      { key: "cons", title: "X", rows: <div />, meta: "7 · in band" },
    ];
    const { getByText } = render(<LeaderboardTemplate h1="x" bands={bands} />);
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
