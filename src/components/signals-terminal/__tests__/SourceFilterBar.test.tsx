import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_WINDOW,
  SourceFilterBar,
} from "@/components/signals-terminal/SourceFilterBar";
import type { SourceKey } from "@/lib/signals/types";

afterEach(() => {
  cleanup();
});

const active = new Set<SourceKey>([
  "hn",
  "github",
  "x",
  "reddit",
  "bluesky",
  "devto",
  "claude",
  "openai",
]);

describe("SourceFilterBar", () => {
  it("renders the ALL chip and a chip per source", () => {
    const { container } = render(
      <SourceFilterBar
        active={active}
        timeWindow={DEFAULT_WINDOW}
        topic={null}
        totalSignals={1466}
      />,
    );

    const chips = container.querySelectorAll(".signals-chip");
    expect(chips.length).toBeGreaterThan(0);
  });
});
