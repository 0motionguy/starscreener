import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ChartLegend,
  ChartShell,
  ChartStat,
  ChartStats,
  ChartWrap,
} from "@/components/ui/ChartShell";

describe("ChartShell", () => {
  it("renders chart chrome, wrapper, legend, and stats", () => {
    const { container, getByText } = render(
      <ChartShell variant="map" aria-label="Radar">
        <ChartLegend variant="map" right="LIVE">
          <span>
            <span className="pip" />
            AI
          </span>
        </ChartLegend>
        <ChartWrap variant="map">
          <svg aria-label="chart" />
        </ChartWrap>
        <ChartStats columns={4}>
          <ChartStat label="Nodes" value="220" sub="24h" />
        </ChartStats>
      </ChartShell>,
    );

    expect(container.querySelector(".ds-chart-shell-map")).toBeTruthy();
    expect(container.querySelector(".map-legend")).toBeTruthy();
    expect(container.querySelector(".map-wrap")).toBeTruthy();
    expect(container.querySelector(".map-stats")).toBeTruthy();
    expect(getByText("AI")).toBeTruthy();
    expect(getByText("LIVE")).toBeTruthy();
    expect(getByText("Nodes")).toBeTruthy();
    expect(getByText("220")).toBeTruthy();
  });
});
