// Unit tests for V4 SourceFeedTemplate (W7 unblocker).
//
// Verifies the slot-based composition contract: each named slot renders
// inside its own block with the matching v4-source-feed-template__* class,
// and the --with-rail body modifier flips on only when rightRail is set.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";

afterEach(() => {
  cleanup();
});

describe("SourceFeedTemplate", () => {
  it("renders crumb / title / lede through the default PageHead", () => {
    const { container, getByText } = render(
      <SourceFeedTemplate
        crumb={
          <>
            <b>HN</b> · TERMINAL · /HACKERNEWS
          </>
        }
        title="Hacker News · trending"
        lede="Stories from the past 72 hours, scored by velocity."
      />,
    );
    expect(container.querySelector(".v4-source-feed-template__head")).not.toBeNull();
    expect(container.querySelector(".v4-page-head__h1")?.textContent).toBe(
      "Hacker News · trending",
    );
    expect(getByText("HN").tagName).toBe("B");
  });

  it("uses the head escape hatch when `head` is provided (skips PageHead)", () => {
    const { container } = render(
      <SourceFeedTemplate
        title="ignored"
        head={<div data-testid="custom-head">custom</div>}
      />,
    );
    // Default PageHead H1 must NOT be rendered when head is overridden.
    expect(container.querySelector(".v4-page-head__h1")).toBeNull();
    expect(container.querySelector('[data-testid="custom-head"]')).not.toBeNull();
  });

  it("renders kpiBand slot only when prop is provided", () => {
    const { container, rerender } = render(<SourceFeedTemplate title="x" />);
    expect(container.querySelector(".v4-source-feed-template__kpi")).toBeNull();
    rerender(
      <SourceFeedTemplate title="x" kpiBand={<div data-testid="k">k</div>} />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__kpi"),
    ).not.toBeNull();
  });

  it("renders filterBar slot only when prop is provided", () => {
    const { container, rerender } = render(<SourceFeedTemplate title="x" />);
    expect(
      container.querySelector(".v4-source-feed-template__filters"),
    ).toBeNull();
    rerender(
      <SourceFeedTemplate
        title="x"
        filterBar={<div data-testid="fb">fb</div>}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__filters"),
    ).not.toBeNull();
  });

  it("renders tabBar slot only when prop is provided", () => {
    const { container, rerender } = render(<SourceFeedTemplate title="x" />);
    expect(
      container.querySelector(".v4-source-feed-template__tabs"),
    ).toBeNull();
    rerender(
      <SourceFeedTemplate
        title="x"
        tabBar={<div data-testid="tb">tb</div>}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__tabs"),
    ).not.toBeNull();
  });

  it("always renders body + main even when mainPanels is empty", () => {
    const { container } = render(<SourceFeedTemplate title="x" />);
    expect(
      container.querySelector(".v4-source-feed-template__body"),
    ).not.toBeNull();
    expect(
      container.querySelector(".v4-source-feed-template__main"),
    ).not.toBeNull();
  });

  it("renders rightRail only when prop is provided + applies --with-rail modifier", () => {
    const { container, rerender } = render(<SourceFeedTemplate title="x" />);
    expect(
      container.querySelector(".v4-source-feed-template__rail"),
    ).toBeNull();
    expect(
      container.querySelector(".v4-source-feed-template__body")?.className,
    ).not.toContain("--with-rail");
    rerender(
      <SourceFeedTemplate
        title="x"
        rightRail={<aside data-testid="r">rail</aside>}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__rail"),
    ).not.toBeNull();
    expect(
      container.querySelector(".v4-source-feed-template__body")?.className,
    ).toContain("--with-rail");
  });

  it("renders footer slot only when prop is provided", () => {
    const { container, rerender } = render(<SourceFeedTemplate title="x" />);
    expect(
      container.querySelector(".v4-source-feed-template__footer"),
    ).toBeNull();
    rerender(
      <SourceFeedTemplate
        title="x"
        footer={<div data-testid="f">f</div>}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__footer"),
    ).not.toBeNull();
  });

  it("merges className on the root wrapper", () => {
    const { container } = render(
      <SourceFeedTemplate title="x" className="custom-root" />,
    );
    const root = container.querySelector(".v4-source-feed-template");
    expect(root?.className).toContain("custom-root");
  });

  it("applies per-slot classNames overrides", () => {
    const { container } = render(
      <SourceFeedTemplate
        title="x"
        kpiBand={<div />}
        filterBar={<div />}
        tabBar={<div />}
        rightRail={<aside />}
        footer={<div />}
        classNames={{
          head: "h-x",
          kpi: "k-x",
          filters: "f-x",
          tabs: "t-x",
          body: "b-x",
          main: "m-x",
          rail: "r-x",
          footer: "ft-x",
        }}
      />,
    );
    expect(
      container.querySelector(".v4-source-feed-template__head")?.className,
    ).toContain("h-x");
    expect(
      container.querySelector(".v4-source-feed-template__kpi")?.className,
    ).toContain("k-x");
    expect(
      container.querySelector(".v4-source-feed-template__filters")?.className,
    ).toContain("f-x");
    expect(
      container.querySelector(".v4-source-feed-template__tabs")?.className,
    ).toContain("t-x");
    expect(
      container.querySelector(".v4-source-feed-template__body")?.className,
    ).toContain("b-x");
    expect(
      container.querySelector(".v4-source-feed-template__main")?.className,
    ).toContain("m-x");
    expect(
      container.querySelector(".v4-source-feed-template__rail")?.className,
    ).toContain("r-x");
    expect(
      container.querySelector(".v4-source-feed-template__footer")?.className,
    ).toContain("ft-x");
  });
});
