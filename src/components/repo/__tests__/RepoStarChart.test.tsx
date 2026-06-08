import { describe, expect, test, vi } from "vitest";
import {
  BarController,
  Chart as ChartJS,
  LineController,
} from "chart.js";

vi.mock("react-chartjs-2", () => ({
  Chart: () => null,
}));

describe("RepoStarChart", () => {
  test("registers the Chart.js controllers used by the mixed line/bar chart", async () => {
    ChartJS.unregister(LineController, BarController);

    expect(() => ChartJS.registry.getController("line")).toThrow(
      /not a registered controller/i,
    );
    expect(() => ChartJS.registry.getController("bar")).toThrow(
      /not a registered controller/i,
    );

    await import("../RepoStarChart");

    expect(() => ChartJS.registry.getController("line")).not.toThrow();
    expect(() => ChartJS.registry.getController("bar")).not.toThrow();
  });
});
