import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

afterEach(() => {
  cleanup();
});

describe("KpiBand snapshot", () => {
  it("renders stable KPI strip markup", () => {
    const { container } = render(
      <KpiBand
        cells={[
          { label: "Signal volume · 24h", value: "42,184", delta: "+18.2%" },
          {
            label: "Sources · live",
            value: "8 / 8",
            sub: <LiveDot label="all healthy" />,
          },
        ]}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
