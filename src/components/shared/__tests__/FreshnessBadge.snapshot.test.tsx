import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

afterEach(() => {
  cleanup();
});

describe("FreshnessBadge snapshot", () => {
  it("renders stable fresh status markup", () => {
    const { container } = render(
      <FreshnessBadge
        lastUpdatedAt="2026-05-05T00:00:00.000Z"
        source="reddit"
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
