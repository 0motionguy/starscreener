import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MentionRow } from "@/components/repo-detail/MentionRow";

afterEach(() => {
  cleanup();
});

describe("MentionEvidenceCard snapshot", () => {
  it("renders stable mention evidence markup", () => {
    const { container } = render(
      <MentionRow
        source="hn"
        author="Ada"
        handle="@ada"
        sourceLabel="HN"
        ts="2h ago"
        body="Launch thread crossed front page."
        stats={[
          { label: "? 412", emphasis: "up" },
          { label: "? 12", emphasis: "down" },
        ]}
        url="news.ycombinator.com/item?id=123"
        href="https://news.ycombinator.com/item?id=123"
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
