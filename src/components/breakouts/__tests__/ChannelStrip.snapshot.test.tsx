import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ChannelHeatStrip,
  type HeatLevel,
} from "@/components/breakouts/ChannelHeatStrip";

const HOURS: HeatLevel[] = [
  0, 1, 1, 0, 2, 1, 2, 2, 1, 2, 3, 3, 2, 3, 3, 3, 2, 2, 1, 1, 0, 1, 0, 0,
];

afterEach(() => {
  cleanup();
});

describe("ChannelStrip snapshot", () => {
  it("renders stable 24-cell strip markup", () => {
    const { container } = render(<ChannelHeatStrip hours={HOURS} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
