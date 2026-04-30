// Unit tests for V4 funding primitives.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MoverRow } from "@/components/funding/MoverRow";
import { ARRClimberRow } from "@/components/funding/ARRClimberRow";
import { DealTapeRow } from "@/components/funding/DealTapeRow";
import { StockRow } from "@/components/funding/StockSparkline";
import { CapitalFlowChart } from "@/components/funding/CapitalFlowChart";
import { SectorHeatmap } from "@/components/funding/SectorHeatmap";
import { LiveTape } from "@/components/funding/LiveTape";

afterEach(() => {
  cleanup();
});

describe("MoverRow", () => {
  it("zero-pads rank, renders amount + raised label", () => {
    const { container, getByText } = render(
      <MoverRow rank={1} name="Anthropic" amount="$2.0B" stage="Series F" />,
    );
    expect(container.querySelector(".v4-mover-row__rank")?.textContent).toBe(
      "01",
    );
    expect(getByText("Anthropic")).not.toBeNull();
    expect(getByText("$2.0B")).not.toBeNull();
    expect(getByText("RAISED")).not.toBeNull();
  });

  it("applies the mega class to Series F/E and IPO stages", () => {
    const { container, rerender } = render(
      <MoverRow rank={1} name="x" amount="$x" stage="Series F" />,
    );
    expect(container.querySelector(".v4-mover-row__stage")?.className).toContain(
      "--mega",
    );
    rerender(<MoverRow rank={1} name="x" amount="$x" stage="IPO" />);
    expect(container.querySelector(".v4-mover-row__stage")?.className).toContain(
      "--mega",
    );
  });

  it("applies #1 row green-rail when first=true", () => {
    const { container } = render(
      <MoverRow rank={1} name="x" amount="$x" stage="Series A" first />,
    );
    expect(container.querySelector(".v4-mover-row")?.className).toContain(
      "v4-mover-row--first",
    );
  });

  it("renders as <a> when href is provided", () => {
    const { container } = render(
      <MoverRow
        rank={1}
        name="x"
        amount="$x"
        stage="Seed"
        href="/funding/x"
      />,
    );
    expect(container.querySelector("a.v4-mover-row")).not.toBeNull();
  });
});

describe("ARRClimberRow", () => {
  it("renders MoM percent + ARR + bar with progressbar role", () => {
    const { container } = render(
      <ARRClimberRow
        rank={1}
        name="Cursor"
        meta="dev tools"
        arr="$140M"
        momPct={18}
      />,
    );
    expect(container.querySelector(".v4-arr-row__pct")?.textContent).toContain(
      "+18%",
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("18");
  });

  it("flags negative MoM with the down class", () => {
    const { container } = render(
      <ARRClimberRow rank={1} name="x" arr="$1" momPct={-5} />,
    );
    expect(container.querySelector(".v4-arr-row__pct")?.className).toContain(
      "--down",
    );
  });

  it("respects custom barPct override", () => {
    const { container } = render(
      <ARRClimberRow rank={1} name="x" arr="$1" momPct={500} barPct={42} />,
    );
    const fill = container.querySelector(".v4-arr-row__bar i") as HTMLElement;
    expect(fill?.style.width).toBe("42%");
  });
});

describe("DealTapeRow", () => {
  it("renders timestamp, title, and amount", () => {
    const { getByText } = render(
      <DealTapeRow
        ts="06:24"
        title={
          <>
            <b>Anthropic</b> raises $2.0B
          </>
        }
        amount="$2.0B"
      />,
    );
    expect(getByText("06:24")).not.toBeNull();
    expect(getByText("Anthropic").tagName).toBe("B");
    expect(getByText("$2.0B")).not.toBeNull();
  });

  it("flags fresh items with green-tint background", () => {
    const { container } = render(
      <DealTapeRow ts="06:24" title="x" amount="$1" fresh />,
    );
    expect(container.querySelector(".v4-tape-row")?.className).toContain(
      "--fresh",
    );
  });

  it("renders source code and stage chips when provided", () => {
    const { getByText } = render(
      <DealTapeRow
        ts="06:24"
        title="x"
        amount="$1"
        sourceCode="BB"
        stage="SERIES F"
      />,
    );
    expect(getByText("BB")).not.toBeNull();
    expect(getByText("SERIES F")).not.toBeNull();
  });
});

describe("StockRow", () => {
  it("renders ticker / name / price / change with direction class", () => {
    const { container, getByText } = render(
      <StockRow
        ticker="NVDA"
        name="NVIDIA"
        price="112.4"
        change="+2.4%"
        direction="up"
        pipColor="#22c55e"
      />,
    );
    expect(getByText("NVDA").className).toContain("v4-stock-row__tic");
    expect(getByText("NVIDIA").className).toContain("v4-stock-row__nm");
    expect(getByText("112.4")).not.toBeNull();
    expect(getByText("+2.4%").className).toContain("--up");
    expect(container.querySelector(".v4-stock-row__pip")).not.toBeNull();
  });

  it("supports down + flat directions", () => {
    const { container, rerender } = render(
      <StockRow
        ticker="x"
        name="X"
        price="1"
        change="-1%"
        direction="down"
      />,
    );
    expect(container.querySelector(".v4-stock-row__ch")?.className).toContain(
      "--down",
    );
    rerender(
      <StockRow
        ticker="x"
        name="X"
        price="1"
        change="0%"
        direction="flat"
      />,
    );
    expect(container.querySelector(".v4-stock-row__ch")?.className).toContain(
      "--flat",
    );
  });
});

describe("CapitalFlowChart", () => {
  const sectors = [
    { key: "agents", label: "AGENTS", color: "var(--v4-violet)" },
    { key: "infra", label: "INFRA", color: "var(--v4-money)" },
  ];

  it("renders an SVG with stacked sector paths", () => {
    const points = Array.from({ length: 5 }, (_, i) => ({
      day: i,
      sectors: { agents: 100 + i * 10, infra: 50 + i * 5 },
    }));
    const { container } = render(
      <CapitalFlowChart points={points} sectors={sectors} />,
    );
    const svg = container.querySelector("svg.v4-capital-flow");
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll("path[fill*='var']").length).toBe(2);
  });

  it("renders an empty state when given no data", () => {
    const { container } = render(
      <CapitalFlowChart points={[]} sectors={sectors} />,
    );
    const svg = container.querySelector("svg.v4-capital-flow");
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll("path").length).toBe(0);
  });

  it("renders the spike marker when spike prop is set", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      day: i,
      sectors: { agents: 100, infra: 50 },
    }));
    const { container } = render(
      <CapitalFlowChart
        points={points}
        sectors={sectors}
        spike={{ index: 5, label: "▲ SPIKE" }}
      />,
    );
    expect(container.textContent).toContain("▲ SPIKE");
  });
});

describe("SectorHeatmap", () => {
  it("renders one row per sector + header + total cell", () => {
    const { container } = render(
      <SectorHeatmap
        stages={["SEED", "A", "B", "C", "D+", "GROWTH"]}
        sectors={[
          {
            key: "x",
            label: "AI · agents",
            pip: "var(--v4-violet)",
            values: [100, 200, 300, 400, 500, 600],
            total: "$2.1B",
          },
          {
            key: "y",
            label: "AI · infra",
            pip: "var(--v4-money)",
            values: [50, 100, 150, 200, 250, 300],
            total: "$1.0B",
          },
        ]}
      />,
    );
    expect(container.querySelectorAll(".v4-sector-heatmap__row")).toHaveLength(3); // 1 head + 2 sector rows
    expect(container.querySelectorAll(".v4-sector-heatmap__cell")).toHaveLength(12); // 2 sectors × 6 stages
  });

  it("formats values >=1000 as $XB and <1000 as $YM", () => {
    const { container } = render(
      <SectorHeatmap
        stages={["X"]}
        sectors={[
          {
            key: "x",
            label: "x",
            pip: "#fff",
            values: [120],
            total: "$120M",
          },
          {
            key: "y",
            label: "y",
            pip: "#fff",
            values: [3800],
            total: "$3.8B",
          },
        ]}
      />,
    );
    const cells = container.querySelectorAll(".v4-sector-heatmap__cell-v");
    expect(cells[0].textContent).toBe("$120M");
    expect(cells[1].textContent).toBe("$3.8B");
  });
});

describe("LiveTape", () => {
  it("renders feed role with provided children", () => {
    const { container, getByText } = render(
      <LiveTape>
        <DealTapeRow ts="06:24" title="x" amount="$1" />
      </LiveTape>,
    );
    const tape = container.querySelector(".v4-live-tape");
    expect(tape?.getAttribute("role")).toBe("feed");
    expect(getByText("06:24")).not.toBeNull();
  });

  it("applies the maxHeight inline when > 0", () => {
    const { container } = render(<LiveTape maxHeight={400}>x</LiveTape>);
    const el = container.querySelector(".v4-live-tape") as HTMLElement;
    expect(el?.style.maxHeight).toBe("400px");
  });

  it("omits maxHeight when 0", () => {
    const { container } = render(<LiveTape maxHeight={0}>x</LiveTape>);
    const el = container.querySelector(".v4-live-tape") as HTMLElement;
    expect(el?.style.maxHeight).toBe("");
  });
});
