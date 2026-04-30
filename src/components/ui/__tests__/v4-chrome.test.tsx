// Unit tests for V4 chrome primitives: CornerDots, LiveDot, PanelHead,
// SectionHead, PageHead. These are the foundation primitives consumed by
// every V4 page; a regression here cascades.
//
// Test-isolation note: this project's vitest.config.ts does NOT install an
// auto-cleanup, so testing-library DOM bleeds across tests in the same
// file. Scope every assertion to the per-render `container` rather than
// document-global `getByText` to keep tests independent.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CornerDots } from "@/components/ui/CornerDots";
import { LiveDot } from "@/components/ui/LiveDot";
import { PanelHead } from "@/components/ui/PanelHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { PageHead } from "@/components/ui/PageHead";

afterEach(() => {
  cleanup();
});

describe("CornerDots", () => {
  it("renders three pip elements with the v4-corner-dots class", () => {
    const { container } = render(<CornerDots />);
    const root = container.querySelector(".v4-corner-dots");
    expect(root).not.toBeNull();
    expect(root?.querySelectorAll("i")).toHaveLength(3);
  });

  it("is aria-hidden — purely decorative", () => {
    const { container } = render(<CornerDots />);
    const root = container.querySelector(".v4-corner-dots");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("LiveDot", () => {
  it("defaults to money tone (green pulse) with no label", () => {
    const { container } = render(<LiveDot />);
    const root = container.querySelector(".v4-live-dot");
    expect(root).not.toBeNull();
    expect(root?.className).toContain("v4-live-dot--money");
    expect(container.querySelector(".v4-live-dot__pip")).not.toBeNull();
    expect(container.querySelector(".v4-live-dot__label")).toBeNull();
  });

  it("renders an accessible status role", () => {
    const { container } = render(<LiveDot label="LIVE" />);
    const root = container.querySelector(".v4-live-dot");
    expect(root?.getAttribute("role")).toBe("status");
    expect(root?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders the label when provided", () => {
    const { getByText } = render(<LiveDot label="LIVE" />);
    expect(getByText("LIVE").className).toBe("v4-live-dot__label");
  });

  it("supports amber, red, and none tones with no pulse animation", () => {
    const { getByText } = render(
      <>
        <LiveDot tone="amber" label="STALE" />
        <LiveDot tone="red" label="DOWN" />
        <LiveDot tone="none" label="—" />
      </>,
    );
    expect(getByText("STALE").parentElement?.className).toContain("--amber");
    expect(getByText("DOWN").parentElement?.className).toContain("--red");
    expect(getByText("—").parentElement?.className).toContain("--none");
  });
});

describe("PanelHead", () => {
  it("renders key and corner dots by default", () => {
    const { getByText, container } = render(<PanelHead k="REPOS" />);
    expect(getByText("REPOS").className).toBe("v4-panel-head__key");
    expect(container.querySelector(".v4-corner-dots")).not.toBeNull();
  });

  it("hides corner dots when corner=false", () => {
    const { container } = render(<PanelHead k="REPOS" corner={false} />);
    expect(container.querySelector(".v4-corner-dots")).toBeNull();
  });

  it("renders the optional subtitle and right slot", () => {
    const { getByText } = render(
      <PanelHead k="REPOS" sub="TOP GAINERS" right={<span>7 / 1,247</span>} />,
    );
    // Sub starts with " · " — assert subtitle text is present.
    expect(getByText(/TOP GAINERS/)).not.toBeNull();
    expect(getByText("7 / 1,247").parentElement?.className).toBe(
      "v4-panel-head__right",
    );
  });
});

describe("SectionHead", () => {
  it("defaults to an h2 title element", () => {
    const { container } = render(
      <SectionHead num="// 01" title="Trending now" />,
    );
    expect(container.querySelector("h2.v4-section-head__title")).not.toBeNull();
    expect(container.querySelector("h3.v4-section-head__title")).toBeNull();
  });

  it("supports h3 via the as prop for nested sub-sections", () => {
    const { container } = render(
      <SectionHead num="// 01.a" title="Sub-section" as="h3" />,
    );
    expect(container.querySelector("h3.v4-section-head__title")).not.toBeNull();
  });

  it("renders num in the orange acc slot", () => {
    const { getByText } = render(<SectionHead num="// 01" title="x" />);
    expect(getByText("// 01").className).toBe("v4-section-head__num");
  });

  it("renders meta only when provided", () => {
    const { container, rerender } = render(
      <SectionHead num="// 01" title="x" />,
    );
    expect(container.querySelector(".v4-section-head__meta")).toBeNull();

    rerender(<SectionHead num="// 01" title="x" meta="3 picks" />);
    expect(container.querySelector(".v4-section-head__meta")).not.toBeNull();
  });
});

describe("PageHead", () => {
  it("renders crumb, h1, and lede when provided", () => {
    const { getByText, container } = render(
      <PageHead
        crumb={
          <>
            <b>SIGNAL</b> · TERMINAL
          </>
        }
        h1="The newsroom for AI."
        lede="Eight sources, one editorial layer."
      />,
    );
    expect(getByText("SIGNAL").tagName).toBe("B");
    expect(container.querySelector("h1.v4-page-head__h1")).not.toBeNull();
    expect(getByText("Eight sources, one editorial layer.").className).toBe(
      "v4-page-head__lede",
    );
  });

  it("places clock content in the right column", () => {
    const { getByText } = render(<PageHead clock={<span>14:00:00</span>} />);
    const clock = getByText("14:00:00");
    expect(clock.parentElement?.className).toBe("v4-page-head__clock");
  });

  it("supports a children escape hatch for repo-detail-style heroes", () => {
    const { getByText } = render(
      <PageHead>
        <div data-testid="custom">custom hero</div>
      </PageHead>,
    );
    expect(getByText("custom hero")).not.toBeNull();
  });

  it("suppresses bottom border with noBorder", () => {
    const { container } = render(<PageHead h1="x" noBorder />);
    const root = container.querySelector(".v4-page-head");
    expect(root?.className).toContain("v4-page-head--no-border");
  });
});
