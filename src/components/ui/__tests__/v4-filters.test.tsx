// Unit tests for V4 filter primitives: Chip, ChipGroup, FilterBar, TabBar.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Chip } from "@/components/ui/Chip";
import { ChipGroup, FilterBar } from "@/components/ui/ChipGroup";
import { TabBar } from "@/components/ui/TabBar";

afterEach(() => {
  cleanup();
});

describe("Chip", () => {
  it("renders a button with label by default", () => {
    const { container } = render(<Chip>ALL</Chip>);
    const btn = container.querySelector("button.v4-chip");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("type")).toBe("button");
    expect(btn?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".v4-chip__label")?.textContent).toBe("ALL");
  });

  it("marks aria-pressed when on", () => {
    const { container } = render(<Chip on>ALL</Chip>);
    expect(container.querySelector(".v4-chip--on")).not.toBeNull();
    expect(container.querySelector(".v4-chip")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("renders swatch, icon, and count slots", () => {
    const { container } = render(
      <Chip swatch="var(--v4-src-hn)" icon={<span data-testid="ico" />} count={42}>
        HN
      </Chip>,
    );
    expect(container.querySelector(".v4-chip__swatch")).not.toBeNull();
    expect(container.querySelector(".v4-chip__icon")).not.toBeNull();
    expect(container.querySelector(".v4-chip__count")?.textContent).toBe("42");
  });

  it("fires onClick when not disabled", () => {
    const onClick = vi.fn();
    const { container } = render(<Chip onClick={onClick}>x</Chip>);
    fireEvent.click(container.querySelector("button.v4-chip")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Chip onClick={onClick} disabled>
        x
      </Chip>,
    );
    fireEvent.click(container.querySelector("button.v4-chip")!);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a span when as=span (non-interactive)", () => {
    const { container } = render(<Chip as="span">x</Chip>);
    expect(container.querySelector("span.v4-chip")).not.toBeNull();
    expect(container.querySelector("button.v4-chip")).toBeNull();
  });

  it("applies acc tone class when on + tone=acc", () => {
    const { container } = render(
      <Chip on tone="acc">
        24H
      </Chip>,
    );
    const chip = container.querySelector(".v4-chip");
    expect(chip?.className).toContain("v4-chip--on");
    expect(chip?.className).toContain("v4-chip--acc");
  });
});

describe("ChipGroup", () => {
  it("renders a label and chip items", () => {
    const { container } = render(
      <ChipGroup label="SOURCES">
        <Chip>HN</Chip>
        <Chip>GH</Chip>
      </ChipGroup>,
    );
    expect(container.querySelector(".v4-chip-group__label")?.textContent).toBe(
      "SOURCES",
    );
    expect(container.querySelectorAll(".v4-chip")).toHaveLength(2);
  });

  it("emits divider mode without children", () => {
    const { container } = render(<ChipGroup divider />);
    const div = container.querySelector(".v4-chip-group__divider");
    expect(div).not.toBeNull();
    expect(div?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders rightSlot when provided", () => {
    const { container } = render(
      <ChipGroup label="x" rightSlot={<span data-testid="r">42</span>}>
        <Chip>a</Chip>
      </ChipGroup>,
    );
    expect(container.querySelector(".v4-chip-group__right")).not.toBeNull();
  });

  it("attaches role=group and aria-label", () => {
    const { container } = render(
      <ChipGroup label="WINDOW">
        <Chip>1H</Chip>
      </ChipGroup>,
    );
    const g = container.querySelector(".v4-chip-group");
    expect(g?.getAttribute("role")).toBe("group");
    expect(g?.getAttribute("aria-label")).toBe("WINDOW");
  });
});

describe("FilterBar", () => {
  it("wraps chip groups in toolbar chrome", () => {
    const { container } = render(
      <FilterBar>
        <ChipGroup label="X">
          <Chip>a</Chip>
        </ChipGroup>
      </FilterBar>,
    );
    expect(container.querySelector(".v4-filter-bar")?.getAttribute("role")).toBe(
      "toolbar",
    );
  });
});

describe("TabBar", () => {
  const items = [
    { id: "all", label: "ALL", count: 14 },
    { id: "hn", label: "HN", count: 3 },
    { id: "rdt", label: "REDDIT", count: 5, disabled: true },
  ];

  it("marks the active tab with aria-selected and on-class", () => {
    const { container } = render(<TabBar items={items} active="hn" />);
    const tabs = container.querySelectorAll(".v4-tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].className).toContain("v4-tab--on");
  });

  it("calls onChange when a tab is clicked (button mode)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TabBar items={items} active="all" onChange={onChange} />,
    );
    fireEvent.click(container.querySelectorAll("button.v4-tab")[1]);
    expect(onChange).toHaveBeenCalledWith("hn");
  });

  it("renders link mode when hrefFor is provided", () => {
    const { container } = render(
      <TabBar items={items} active="all" hrefFor={(id) => `/?cat=${id}`} />,
    );
    const links = container.querySelectorAll("a.v4-tab");
    expect(links).toHaveLength(3);
    expect(links[0].getAttribute("href")).toBe("/?cat=all");
  });

  it("renders count slot", () => {
    const { container } = render(<TabBar items={items} active="all" />);
    const counts = container.querySelectorAll(".v4-tab__count");
    expect(counts[0].textContent).toBe("14");
    expect(counts[2].textContent).toBe("5");
  });

  it("disables disabled tabs", () => {
    const { container } = render(<TabBar items={items} active="all" />);
    const tabs = container.querySelectorAll("button.v4-tab");
    expect(tabs[2]).toHaveProperty("disabled", true);
  });

  it("renders the optional right slot", () => {
    const { container } = render(
      <TabBar
        items={items}
        active="all"
        rightSlot={<span data-testid="r">live</span>}
      />,
    );
    expect(container.querySelector(".v4-tab-bar__right")).not.toBeNull();
  });
});
