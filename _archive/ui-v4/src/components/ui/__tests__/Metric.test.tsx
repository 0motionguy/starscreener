import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Metric, MetricGrid } from "@/components/ui/Metric";

describe("Metric", () => {
  it("renders a metric cell with label, value, delta, and sub text", () => {
    const { getByText, container } = render(
      <MetricGrid columns={5}>
        <Metric
          label="Tracked"
          value="1,249"
          delta="+12"
          sub="24h"
          tone="positive"
          pip
        />
      </MetricGrid>,
    );

    expect(container.querySelector(".ds-metric-grid")).toBeTruthy();
    expect(container.querySelector(".ds-metric-positive")).toBeTruthy();
    expect(container.querySelector(".pip")).toBeTruthy();
    expect(getByText("Tracked")).toBeTruthy();
    expect(getByText("1,249")).toBeTruthy();
    expect(getByText("+12")).toBeTruthy();
    expect(getByText("24h")).toBeTruthy();
  });
});
