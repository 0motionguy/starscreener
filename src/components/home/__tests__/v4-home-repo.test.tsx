// Unit tests for V4 home + repo-detail primitives:
// CategoryPanel, MentionRow, RelatedRepoCard.
// (ChannelHeatStrip lands in the next slice.)

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CategoryPanel } from "@/components/home/CategoryPanel";
import { MentionRow } from "@/components/repo-detail/MentionRow";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";

afterEach(() => {
  cleanup();
});

describe("CategoryPanel", () => {
  it("renders title, count, and live indicator by default", () => {
    const { container, getByText } = render(
      <CategoryPanel title="REPOS · TOP GAINERS" count="7 / 1,247">
        <div>row</div>
      </CategoryPanel>,
    );
    expect(getByText("REPOS · TOP GAINERS").className).toBe(
      "v4-cat-panel__title",
    );
    expect(getByText("7 / 1,247").className).toBe("v4-cat-panel__count");
    expect(container.querySelector(".v4-cat-panel__live")).not.toBeNull();
  });

  it("hides the live indicator when live=false", () => {
    const { container } = render(
      <CategoryPanel title="x" live={false}>
        <div>row</div>
      </CategoryPanel>,
    );
    expect(container.querySelector(".v4-cat-panel__live")).toBeNull();
  });

  it("renders the leading pip when pip color is provided", () => {
    const { container } = render(
      <CategoryPanel title="x" pip="var(--v4-acc)">
        <div>row</div>
      </CategoryPanel>,
    );
    expect(container.querySelector(".v4-cat-panel__pip")).not.toBeNull();
  });

  it("renders foot left + right (with anchor when href set)", () => {
    const { container, getByText } = render(
      <CategoryPanel
        title="x"
        foot={{
          left: "updated 38s ago",
          right: "view all 1,247 →",
          href: "/",
        }}
      >
        <div>row</div>
      </CategoryPanel>,
    );
    expect(getByText("updated 38s ago")).not.toBeNull();
    const link = container.querySelector(".v4-cat-panel__foot a");
    expect(link?.getAttribute("href")).toBe("/");
    expect(link?.textContent).toBe("view all 1,247 →");
  });

  it("renders the body children", () => {
    const { getByText } = render(
      <CategoryPanel title="x">
        <span>row-content-1</span>
        <span>row-content-2</span>
      </CategoryPanel>,
    );
    expect(getByText("row-content-1")).not.toBeNull();
    expect(getByText("row-content-2")).not.toBeNull();
  });
});

describe("MentionRow", () => {
  it("renders source pip avatar by default and the body text", () => {
    const { container, getByText } = render(
      <MentionRow
        source="hn"
        author="lucasronin"
        ts="2d ago"
        body="Show HN: Tolaria — a desktop app"
      />,
    );
    expect(container.querySelector(".v4-source-pip")).not.toBeNull();
    expect(container.querySelector(".v4-mention-row")?.className).toContain(
      "v4-mention-row--hn",
    );
    expect(getByText("lucasronin")).not.toBeNull();
    expect(getByText("Show HN: Tolaria — a desktop app")).not.toBeNull();
  });

  it("uses a custom avatar when provided", () => {
    const { container } = render(
      <MentionRow
        source="reddit"
        author="x"
        ts="1d"
        body="x"
        avatar={<span data-testid="custom-av" />}
      />,
    );
    expect(container.querySelector("[data-testid='custom-av']")).not.toBeNull();
    expect(container.querySelector(".v4-source-pip")).toBeNull();
  });

  it("renders stat chips with emphasis classes", () => {
    const { container } = render(
      <MentionRow
        source="hn"
        author="x"
        ts="now"
        body="x"
        stats={[
          { label: "▲ 412", emphasis: "up" },
          { label: "💬 184" },
          { label: "↓ -3", emphasis: "down" },
        ]}
      />,
    );
    const chips = container.querySelectorAll(".v4-mention-row__stat");
    expect(chips).toHaveLength(3);
    expect(chips[0].className).toContain("--up");
    expect(chips[2].className).toContain("--down");
  });

  it("renders an OPEN button only when href is provided, with target=_blank", () => {
    const { container, rerender } = render(
      <MentionRow source="hn" author="x" ts="now" body="x" />,
    );
    expect(container.querySelector(".v4-mention-row__open")).toBeNull();

    rerender(
      <MentionRow
        source="hn"
        author="x"
        ts="now"
        body="x"
        href="https://news.yc"
      />,
    );
    const open = container.querySelector(
      "a.v4-mention-row__open",
    ) as HTMLAnchorElement | null;
    expect(open?.getAttribute("href")).toBe("https://news.yc");
    expect(open?.getAttribute("target")).toBe("_blank");
    expect(open?.getAttribute("rel")).toBe("noopener");
  });

  it("renders url preview text in the meta line", () => {
    const { container } = render(
      <MentionRow
        source="hn"
        author="x"
        ts="now"
        body="x"
        url="news.ycombinator.com/item?id=…"
      />,
    );
    expect(container.querySelector(".v4-mention-row__url")?.textContent).toBe(
      "news.ycombinator.com/item?id=…",
    );
  });
});

describe("RelatedRepoCard", () => {
  it("renders fullName and description", () => {
    const { getByText } = render(
      <RelatedRepoCard
        fullName="abhigyanpatwari/GitNexus"
        description="The Zero-Server Code Intelligence Engine"
      />,
    );
    expect(getByText("abhigyanpatwari/GitNexus")).not.toBeNull();
    expect(
      getByText("The Zero-Server Code Intelligence Engine"),
    ).not.toBeNull();
  });

  it("renders language, stars, and similarity in the foot row", () => {
    const { container, getByText } = render(
      <RelatedRepoCard
        fullName="x/y"
        language="TYPESCRIPT"
        stars="22.2K"
        similarity="SIM 0.86"
      />,
    );
    expect(getByText("TYPESCRIPT").className).toBe("v4-related-card__lang");
    expect(container.querySelector(".v4-related-card__stars")?.textContent).toBe(
      "★ 22.2K",
    );
    expect(getByText("SIM 0.86").className).toBe("v4-related-card__why");
  });

  it("renders as <a> when href is provided", () => {
    const { container } = render(
      <RelatedRepoCard fullName="x/y" href="/repo/x/y" />,
    );
    expect(
      container.querySelector("a.v4-related-card")?.getAttribute("href"),
    ).toBe("/repo/x/y");
    expect(container.querySelector(".v4-related-card")?.className).toContain(
      "v4-related-card--interactive",
    );
  });

  it("omits optional sections cleanly", () => {
    const { container } = render(<RelatedRepoCard fullName="x/y" />);
    expect(container.querySelector(".v4-related-card__desc")).toBeNull();
    expect(container.querySelector(".v4-related-card__lang")).toBeNull();
    expect(container.querySelector(".v4-related-card__stars")).toBeNull();
    expect(container.querySelector(".v4-related-card__why")).toBeNull();
  });
});
