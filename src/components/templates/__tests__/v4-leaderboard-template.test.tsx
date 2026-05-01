// V4 — LeaderboardTemplate unit tests
//
// Verifies slot markers (PageHead, kpi, filters, featuredBand, leaderboard,
// rightRail, footer, bands) and RankRow integration in the canonical
// `leaderboard` slot.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  LeaderboardTemplate,
  type LeaderboardBand,
} from "@/components/templates/LeaderboardTemplate";
import { RankRow } from "@/components/ui/RankRow";

afterEach(() => {
  cleanup();
});

describe("LeaderboardTemplate — PageHead pass-through", () => {
  it("renders crumb / h1 / lede / clock through PageHead", () => {
    const { container, getByText } = render(
      <LeaderboardTemplate
        crumb={
          <>
            <b>SKILLS</b> · TERMINAL
          </>
        }
        h1="Trending Claude Skills"
        lede="Curated weekly across the ecosystem."
        clock={<span data-testid="clock">12:00 UTC</span>}
      />,
    );
    expect(container.querySelector(".v4-page-head__h1")?.textContent).toBe(
      "Trending Claude Skills",
    );
    expect(container.querySelector(".v4-page-head__lede")?.textContent).toBe(
      "Curated weekly across the ecosystem.",
    );
    expect(getByText("SKILLS").tagName).toBe("B");
    expect(container.querySelector(".v4-page-head__clock")).not.toBeNull();
  });
});

describe("LeaderboardTemplate — slot markers", () => {
  it("renders __kpi only when kpiBand is provided", () => {
    const { container, rerender } = render(<LeaderboardTemplate h1="x" />);
    expect(container.querySelector(".v4-leaderboard-template__kpi")).toBeNull();
    rerender(<LeaderboardTemplate h1="x" kpiBand={<div data-testid="kpi" />} />);
    expect(
      container.querySelector(".v4-leaderboard-template__kpi"),
    ).not.toBeNull();
  });

  it("renders __filters only when filterBar is provided", () => {
    const { container, rerender } = render(<LeaderboardTemplate h1="x" />);
    expect(
      container.querySelector(".v4-leaderboard-template__filters"),
    ).toBeNull();
    rerender(
      <LeaderboardTemplate h1="x" filterBar={<div data-testid="fil" />} />,
    );
    expect(
      container.querySelector(".v4-leaderboard-template__filters"),
    ).not.toBeNull();
  });

  it("renders __featured only when featuredBand is provided", () => {
    const { container, rerender } = render(<LeaderboardTemplate h1="x" />);
    expect(
      container.querySelector(".v4-leaderboard-template__featured"),
    ).toBeNull();
    rerender(
      <LeaderboardTemplate
        h1="x"
        featuredBand={<div data-testid="hero">#1 hero</div>}
      />,
    );
    const featured = container.querySelector(
      ".v4-leaderboard-template__featured",
    );
    expect(featured).not.toBeNull();
    expect(featured?.textContent).toContain("#1 hero");
  });

  it("renders __footer only when footer is provided", () => {
    const { container, rerender } = render(<LeaderboardTemplate h1="x" />);
    expect(
      container.querySelector(".v4-leaderboard-template__footer"),
    ).toBeNull();
    rerender(
      <LeaderboardTemplate
        h1="x"
        footer={<div data-testid="ft">methodology</div>}
      />,
    );
    expect(
      container.querySelector(".v4-leaderboard-template__footer"),
    ).not.toBeNull();
  });
});

describe("LeaderboardTemplate — body modes", () => {
  it("renders __leaderboard slot in flat mode", () => {
    const { container } = render(
      <LeaderboardTemplate
        h1="x"
        leaderboard={<div data-testid="rows" />}
        leaderboardEyebrow="LIST"
      />,
    );
    expect(container.querySelector(".v4-leaderboard-template__band")).toBeNull();
    expect(
      container.querySelector(".v4-leaderboard-template__leaderboard"),
    ).not.toBeNull();
  });

  it("integrates RankRow children inside the __leaderboard slot", () => {
    const { container } = render(
      <LeaderboardTemplate
        h1="Trending"
        leaderboard={
          <>
            <RankRow rank={1} title="anthropic/claude-code" first />
            <RankRow rank={2} title="openai/codex" />
            <RankRow rank={3} title="microsoft/vscode" />
          </>
        }
      />,
    );
    const slot = container.querySelector(
      ".v4-leaderboard-template__leaderboard",
    );
    expect(slot).not.toBeNull();
    const rows = slot?.querySelectorAll(".v4-rank-row");
    expect(rows).toHaveLength(3);
    expect(rows?.[0].className).toContain("v4-rank-row--first");
    expect(rows?.[0].textContent).toContain("anthropic/claude-code");
  });

  it("uses leaderboardNum for the SectionHead prefix", () => {
    const { container } = render(
      <LeaderboardTemplate
        h1="x"
        leaderboard={<div />}
        leaderboardEyebrow="EYEBROW"
        leaderboardNum="// 03"
      />,
    );
    expect(container.querySelector(".v4-section-head__num")?.textContent).toBe(
      "// 03",
    );
  });

  it("renders one __band per entry when bands is provided", () => {
    const bands: LeaderboardBand[] = [
      { key: "cons", title: "STRONG CONSENSUS", rows: <div>a</div> },
      { key: "early", title: "EARLY CALL", rows: <div>b</div> },
      { key: "div", title: "DIVERGENCE", rows: <div>c</div> },
    ];
    const { container } = render(
      <LeaderboardTemplate h1="x" bands={bands} />,
    );
    const sections = container.querySelectorAll(
      ".v4-leaderboard-template__band",
    );
    expect(sections).toHaveLength(3);
    expect(sections[0].className).toContain("--cons");
    expect(sections[1].className).toContain("--early");
    expect(sections[2].className).toContain("--div");
  });

  it("renders band meta + num when provided", () => {
    const bands: LeaderboardBand[] = [
      {
        key: "cons",
        title: "BAND",
        num: "// 01",
        rows: <div />,
        meta: "7 · in band",
      },
    ];
    const { getByText } = render(
      <LeaderboardTemplate h1="x" bands={bands} />,
    );
    expect(getByText("7 · in band")).not.toBeNull();
    expect(getByText("// 01")).not.toBeNull();
  });

  it("prefers bands over leaderboard when both are provided", () => {
    const bands: LeaderboardBand[] = [
      { key: "cons", title: "B", rows: <div>band-row</div> },
    ];
    const { container } = render(
      <LeaderboardTemplate
        h1="x"
        bands={bands}
        leaderboard={<div data-testid="flat">flat-row</div>}
      />,
    );
    expect(
      container.querySelector(".v4-leaderboard-template__band"),
    ).not.toBeNull();
    expect(
      container.querySelector(".v4-leaderboard-template__leaderboard"),
    ).toBeNull();
  });
});

describe("LeaderboardTemplate — rail layout", () => {
  it("applies --with-rail modifier only when rightRail is set", () => {
    const { container, rerender } = render(<LeaderboardTemplate h1="x" />);
    expect(
      container.querySelector(".v4-leaderboard-template__body")?.className,
    ).not.toContain("--with-rail");
    rerender(
      <LeaderboardTemplate
        h1="x"
        rightRail={<aside data-testid="rail">methodology</aside>}
      />,
    );
    expect(
      container.querySelector(".v4-leaderboard-template__body")?.className,
    ).toContain("--with-rail");
    expect(
      container.querySelector(".v4-leaderboard-template__rail"),
    ).not.toBeNull();
  });
});

describe("LeaderboardTemplate — className passthrough", () => {
  it("merges className onto root element", () => {
    const { container } = render(
      <LeaderboardTemplate h1="x" className="custom-class" />,
    );
    const root = container.querySelector(".v4-leaderboard-template");
    expect(root?.className).toContain("custom-class");
  });
});
