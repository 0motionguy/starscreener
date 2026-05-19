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
  it("shows per-source counts on dark brand-tinted source chips", () => {
    const { getByLabelText } = render(
      <SourceFilterBar
        active={active}
        timeWindow={DEFAULT_WINDOW}
        topic={null}
        totalSignals={1466}
        sourceCounts={{
          hn: 24,
          github: 50,
          x: 0,
          reddit: 1387,
          bluesky: 1,
          devto: 4,
          claude: 0,
          openai: 0,
        }}
      />,
    );

    const gh = getByLabelText("GH");

    expect(gh.textContent).toContain("50");
    expect((gh as HTMLElement).style.getPropertyValue("--chip-color")).not.toBe("");
  });
});
