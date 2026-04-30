// Unit tests for V4 tools primitives: ToolTile, MiniListCard, Treemap.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolTile } from "@/components/tools/ToolTile";
import { MiniListCard } from "@/components/tools/MiniListCard";
import { Treemap } from "@/components/tools/Treemap";

afterEach(() => {
  cleanup();
});

describe("ToolTile", () => {
  it("renders num / title / desc and the basic v4-tool-tile chrome", () => {
    const { container, getByText } = render(
      <ToolTile num="// 01 · NEW" title="Star History" desc="Plot multiple repos." />,
    );
    expect(container.querySelector(".v4-tool-tile")).not.toBeNull();
    expect(getByText("// 01 · NEW").className).toBe("v4-tool-tile__num");
    expect(getByText("Star History").className).toBe("v4-tool-tile__title");
    expect(getByText("Plot multiple repos.").className).toBe(
      "v4-tool-tile__desc",
    );
  });

  it("applies the active class when active=true", () => {
    const { container } = render(
      <ToolTile num="// 01" title="x" desc="y" active />,
    );
    expect(container.querySelector(".v4-tool-tile")?.className).toContain(
      "v4-tool-tile--active",
    );
  });

  it("renders as <a> when href is provided + adds interactive class", () => {
    const { container } = render(
      <ToolTile num="// 01" title="x" desc="y" href="/tools/star-history" />,
    );
    expect(
      container.querySelector("a.v4-tool-tile")?.getAttribute("href"),
    ).toBe("/tools/star-history");
    expect(container.querySelector(".v4-tool-tile")?.className).toContain(
      "v4-tool-tile--interactive",
    );
  });

  it("renders foot and preview slots when provided", () => {
    const { container } = render(
      <ToolTile
        num="// 01"
        title="x"
        desc="y"
        foot={<span data-testid="foot">live</span>}
        preview={<svg data-testid="prev" />}
      />,
    );
    expect(container.querySelector(".v4-tool-tile__foot")).not.toBeNull();
    expect(container.querySelector(".v4-tool-tile__preview")).not.toBeNull();
  });

  it("omits foot and preview when not provided", () => {
    const { container } = render(<ToolTile num="// 01" title="x" desc="y" />);
    expect(container.querySelector(".v4-tool-tile__foot")).toBeNull();
    expect(container.querySelector(".v4-tool-tile__preview")).toBeNull();
  });
});

describe("MiniListCard", () => {
  const items = [
    { name: "Claude Sonnet 4.5", value: "4.92" },
    { name: "GPT-5", value: "4.71" },
    { name: "Gemini 2.5 Pro", value: "4.48" },
  ];

  it("renders title, badge, items, and default CTA", () => {
    const { container, getByText } = render(
      <MiniListCard
        icon="✦"
        title="TOP 10 · LLMS"
        badge="7D"
        items={items}
      />,
    );
    expect(getByText("TOP 10 · LLMS").className).toBe("v4-mini-list__title");
    expect(getByText("7D").className).toBe("v4-mini-list__badge");
    expect(container.querySelectorAll(".v4-mini-list__items > li")).toHaveLength(
      3,
    );
    expect(container.querySelector(".v4-mini-list__cta")?.textContent).toContain(
      "OPEN FULL",
    );
  });

  it("supports a custom CTA", () => {
    const { container } = render(
      <MiniListCard title="X" items={items} cta="VIEW ALL →" />,
    );
    expect(container.querySelector(".v4-mini-list__cta")?.textContent).toContain(
      "VIEW ALL",
    );
  });

  it("renders as <a> when href is provided", () => {
    const { container } = render(
      <MiniListCard title="X" items={items} href="/tools/top10/llms" />,
    );
    expect(
      container.querySelector("a.v4-mini-list")?.getAttribute("href"),
    ).toBe("/tools/top10/llms");
  });

  it("formats item value as bold/mono/money color", () => {
    const { container } = render(
      <MiniListCard
        title="X"
        items={[{ name: "x", value: "+42%" }]}
      />,
    );
    const v = container.querySelector(".v4-mini-list__value");
    expect(v?.tagName).toBe("B");
    expect(v?.textContent).toBe("+42%");
  });
});

describe("Treemap", () => {
  it("renders one <rect> per cell with correct dimensions and fill", () => {
    const { container } = render(
      <Treemap
        cells={[
          { x: 0, y: 0, w: 100, h: 50, color: "#3ad6c5", label: "AI" },
          { x: 100, y: 0, w: 50, h: 50, color: "#ff6b35", label: "ML" },
        ]}
      />,
    );
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(2);
    expect(rects[0].getAttribute("width")).toBe("100");
    expect(rects[1].getAttribute("fill")).toBe("#ff6b35");
  });

  it("renders label text per cell", () => {
    const { container } = render(
      <Treemap
        cells={[
          { x: 0, y: 0, w: 100, h: 50, color: "#000", label: "AI" },
          { x: 0, y: 50, w: 100, h: 50, color: "#000", label: "ML" },
        ]}
      />,
    );
    const texts = container.querySelectorAll("text");
    // Two label texts (sub omitted because no sub provided).
    expect(texts).toHaveLength(2);
    expect(texts[0].textContent).toBe("AI");
    expect(texts[1].textContent).toBe("ML");
  });

  it("hides the sub line when cell height ≤ 36", () => {
    const { container } = render(
      <Treemap
        cells={[
          { x: 0, y: 0, w: 100, h: 30, color: "#000", label: "X", sub: "tiny" },
        ]}
      />,
    );
    const texts = container.querySelectorAll("text");
    // Only the label should render — sub suppressed because h ≤ 36.
    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toBe("X");
  });

  it("uses big-cell styling (bigger font, bolder weight) when big=true", () => {
    const { container } = render(
      <Treemap
        cells={[
          {
            x: 0,
            y: 0,
            w: 200,
            h: 200,
            color: "#000",
            label: "AI",
            sub: "hero",
            big: true,
          },
        ]}
      />,
    );
    const subText = container.querySelectorAll("text")[1];
    expect(subText?.getAttribute("font-weight")).toBe("700");
    expect(subText?.getAttribute("font-size")).toBe("14");
  });

  it("emits an aria-label on the root SVG", () => {
    const { container } = render(<Treemap cells={[]} />);
    const svg = container.querySelector("svg.v4-treemap");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Treemap of categories");
  });
});
