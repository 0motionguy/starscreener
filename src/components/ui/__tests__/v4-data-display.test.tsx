// Unit tests for V4 data-display primitives: SourcePip, GaugeStrip,
// KpiBand, RankRow, VerdictRibbon.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SourcePip } from "@/components/ui/SourcePip";
import { GaugeStrip } from "@/components/ui/GaugeStrip";
import { KpiBand } from "@/components/ui/KpiBand";
import { RankRow } from "@/components/ui/RankRow";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";

afterEach(() => {
  cleanup();
});

describe("SourcePip", () => {
  it("renders the canonical 2-letter code per source", () => {
    const { container } = render(<SourcePip src="hn" />);
    const pip = container.querySelector(".v4-source-pip");
    expect(pip?.textContent).toBe("HN");
    expect(pip?.className).toContain("v4-source-pip--hn");
    expect(pip?.className).toContain("v4-source-pip--md");
  });

  it("aliases 'github' to 'gh' classname and code", () => {
    const { container } = render(<SourcePip src="github" />);
    const pip = container.querySelector(".v4-source-pip");
    expect(pip?.className).toContain("v4-source-pip--gh");
    expect(pip?.textContent).toBe("GH");
  });

  it("supports sm/md/lg sizes", () => {
    const { container } = render(
      <>
        <SourcePip src="hn" size="sm" />
        <SourcePip src="hn" size="md" />
        <SourcePip src="hn" size="lg" />
      </>,
    );
    const pips = container.querySelectorAll(".v4-source-pip");
    expect(pips[0].className).toContain("--sm");
    expect(pips[1].className).toContain("--md");
    expect(pips[2].className).toContain("--lg");
  });

  it("allows code override", () => {
    const { container } = render(<SourcePip src="reddit" code="r" />);
    expect(container.querySelector(".v4-source-pip")?.textContent).toBe("r");
  });
});

describe("GaugeStrip", () => {
  it("renders one cell per item with state class", () => {
    const { container } = render(
      <GaugeStrip
        cells={[
          { state: "on" },
          { state: "on" },
          { state: "weak" },
          { state: "off" },
        ]}
      />,
    );
    const cells = container.querySelectorAll(".v4-gauge-cell");
    expect(cells).toHaveLength(4);
    expect(cells[0].className).toContain("--on");
    expect(cells[2].className).toContain("--weak");
    expect(cells[3].className).toContain("--off");
  });

  it("summarizes cell states for screen readers", () => {
    const { container } = render(
      <GaugeStrip
        cells={[
          { state: "on" },
          { state: "on" },
          { state: "on" },
          { state: "weak" },
          { state: "off" },
          { state: "off" },
          { state: "off" },
          { state: "off" },
        ]}
      />,
    );
    const root = container.querySelector(".v4-gauge-strip");
    expect(root?.getAttribute("role")).toBe("img");
    expect(root?.getAttribute("aria-label")).toBe(
      "3 of 8 sources agree (plus 1 weak signals)",
    );
  });

  it("respects custom cellWidth/cellHeight/gap", () => {
    const { container } = render(
      <GaugeStrip
        cells={[{ state: "on" }, { state: "off" }]}
        cellWidth={20}
        cellHeight={20}
        gap={4}
      />,
    );
    const root = container.querySelector(".v4-gauge-strip") as HTMLElement;
    expect(root?.style.gap).toBe("4px");
    const cell = container.querySelector(".v4-gauge-cell") as HTMLElement;
    expect(cell?.style.width).toBe("20px");
    expect(cell?.style.height).toBe("20px");
  });
});

describe("KpiBand", () => {
  it("renders one cell per array item", () => {
    const { container } = render(
      <KpiBand
        cells={[
          { label: "A", value: "1" },
          { label: "B", value: "2" },
          { label: "C", value: "3" },
        ]}
      />,
    );
    expect(container.querySelectorAll(".v4-kpi-cell")).toHaveLength(3);
  });

  it("applies tone class to value coloring", () => {
    const { container } = render(
      <KpiBand
        cells={[
          { label: "x", value: "1", tone: "money" },
          { label: "x", value: "2", tone: "amber" },
        ]}
      />,
    );
    const cells = container.querySelectorAll(".v4-kpi-cell");
    expect(cells[0].className).toContain("v4-kpi-cell--money");
    expect(cells[1].className).toContain("v4-kpi-cell--amber");
  });

  it("renders pip, delta, and sub when provided", () => {
    const { container } = render(
      <KpiBand
        cells={[
          {
            label: "X",
            value: "42",
            pip: "var(--v4-money)",
            delta: "+8%",
            sub: "vs prev 24h",
          },
        ]}
      />,
    );
    expect(container.querySelector(".v4-kpi-cell__pip")).not.toBeNull();
    expect(container.querySelector(".v4-kpi-cell__delta")?.textContent).toBe(
      "+8%",
    );
    expect(container.querySelector(".v4-kpi-cell__sub")?.textContent).toBe(
      "vs prev 24h",
    );
  });

  it("omits delta/sub elements when not provided", () => {
    const { container } = render(
      <KpiBand cells={[{ label: "x", value: "1" }]} />,
    );
    expect(container.querySelector(".v4-kpi-cell__delta")).toBeNull();
    expect(container.querySelector(".v4-kpi-cell__sub")).toBeNull();
  });
});

describe("RankRow", () => {
  it("zero-pads numeric ranks to 2 digits", () => {
    const { container } = render(<RankRow rank={3} title="x" />);
    expect(container.querySelector(".v4-rank-row__rank")?.textContent).toBe(
      "03",
    );
  });

  it("preserves string ranks verbatim", () => {
    const { container } = render(<RankRow rank="3a" title="x" />);
    expect(container.querySelector(".v4-rank-row__rank")?.textContent).toBe(
      "3a",
    );
  });

  it("applies the first-row treatment", () => {
    const { container } = render(<RankRow rank={1} title="x" first />);
    const row = container.querySelector(".v4-rank-row");
    expect(row?.className).toContain("v4-rank-row--first");
  });

  it("renders as <a> when href is provided", () => {
    const { container } = render(
      <RankRow rank={1} title="x" href="/repo/anthropic/skills" />,
    );
    expect(container.querySelector("a.v4-rank-row")).not.toBeNull();
    expect(
      container.querySelector("a.v4-rank-row")?.getAttribute("href"),
    ).toBe("/repo/anthropic/skills");
  });

  it("renders metric and delta with sparkline", () => {
    const { container } = render(
      <RankRow
        rank={1}
        title="x"
        metric={{ value: "4.81", label: "/ 5.0" }}
        delta={{
          value: "+18%",
          direction: "up",
          sparkline: <svg data-testid="sp" />,
        }}
      />,
    );
    expect(container.querySelector(".v4-rank-row__metric-value")?.textContent).toBe(
      "4.81",
    );
    expect(container.querySelector(".v4-rank-row__delta--up")).not.toBeNull();
    expect(container.querySelector(".v4-rank-row__delta-spark svg")).not.toBeNull();
  });

  it("hides arrow when arrow prop is null", () => {
    const { container } = render(<RankRow rank={1} title="x" arrow={null} />);
    expect(container.querySelector(".v4-rank-row__arr")).toBeNull();
  });
});

describe("VerdictRibbon", () => {
  it("defaults to acc tone with the orange left rail", () => {
    const { container } = render(<VerdictRibbon text="Verdict here." />);
    const ribbon = container.querySelector(".v4-verdict-ribbon");
    expect(ribbon?.className).toContain("v4-verdict-ribbon--acc");
  });

  it("supports money and amber tones", () => {
    const { container } = render(
      <>
        <VerdictRibbon tone="money" text="x" />
        <VerdictRibbon tone="amber" text="y" />
      </>,
    );
    const ribbons = container.querySelectorAll(".v4-verdict-ribbon");
    expect(ribbons[0].className).toContain("--money");
    expect(ribbons[1].className).toContain("--amber");
  });

  it("renders stamp eyebrow / headline / sub when provided", () => {
    const { container } = render(
      <VerdictRibbon
        stamp={{
          eyebrow: "// TODAY",
          headline: "28 APR",
          sub: "computed 4m ago",
        }}
        text="ok"
      />,
    );
    expect(container.querySelector(".v4-verdict-ribbon__eyebrow")?.textContent).toBe(
      "// TODAY",
    );
    expect(
      container.querySelector(".v4-verdict-ribbon__headline")?.textContent,
    ).toBe("28 APR");
    expect(container.querySelector(".v4-verdict-ribbon__sub")?.textContent).toBe(
      "computed 4m ago",
    );
  });

  it("renders an action link when actionHref is set", () => {
    const { container } = render(
      <VerdictRibbon text="x" actionHref="/methodology" actionLabel="DOCS" />,
    );
    const link = container.querySelector("a.v4-verdict-ribbon__action");
    expect(link?.getAttribute("href")).toBe("/methodology");
    expect(link?.textContent).toBe("DOCS");
  });

  it("supports rich ReactNode text", () => {
    const { container } = render(
      <VerdictRibbon
        text={
          <>
            <b>14 strong picks</b> today across 8 sources.
          </>
        }
      />,
    );
    expect(container.querySelector(".v4-verdict-ribbon__text b")?.textContent).toBe(
      "14 strong picks",
    );
  });
});
