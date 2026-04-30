// Unit tests for ChannelHeatStrip.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChannelHeatStrip, type HeatLevel } from "@/components/breakouts/ChannelHeatStrip";

afterEach(() => {
  cleanup();
});

const TWENTY_FOUR: HeatLevel[] = [
  0, 0, 0, 1, 1, 1, 2, 2, 1, 2, 3, 3, 2, 3, 3, 3, 2, 2, 1, 1, 0, 1, 0, 0,
];

describe("ChannelHeatStrip", () => {
  it("renders 24 cells with correct heat-level classes", () => {
    const { container } = render(<ChannelHeatStrip hours={TWENTY_FOUR} />);
    const cells = container.querySelectorAll(".v4-heat-strip__cell");
    expect(cells).toHaveLength(24);
    expect(cells[0].className).toBe("v4-heat-strip__cell"); // h0 = no extra class
    expect(cells[3].className).toContain("--h1");
    expect(cells[6].className).toContain("--h2");
    expect(cells[10].className).toContain("--h3");
  });

  it("pads short input arrays to 24 cells", () => {
    const { container } = render(
      <ChannelHeatStrip hours={[3, 3, 3] as HeatLevel[]} />,
    );
    const cells = container.querySelectorAll(".v4-heat-strip__cell");
    expect(cells).toHaveLength(24);
    expect(cells[0].className).toContain("--h3");
    expect(cells[5].className).toBe("v4-heat-strip__cell"); // padded with h0
  });

  it("emits an aria-label summarizing intensity", () => {
    const { container } = render(<ChannelHeatStrip hours={TWENTY_FOUR} />);
    const root = container.querySelector(".v4-heat-strip");
    expect(root?.getAttribute("role")).toBe("img");
    const label = root?.getAttribute("aria-label") ?? "";
    expect(label).toContain("hot hours");
  });

  it("supports a custom aria-label override", () => {
    const { container } = render(
      <ChannelHeatStrip hours={TWENTY_FOUR} label="custom-label" />,
    );
    expect(container.querySelector(".v4-heat-strip")?.getAttribute("aria-label")).toBe(
      "custom-label",
    );
  });
});
